import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useReducer,
	useState,
} from "react";
import { GraphEdge, GraphNode } from "reagraph";
import { ErrnoError } from "./errno";
import { Filesystem } from "./fs-impl";
import { FileType, IReadonlyFilesystem } from "./fs-interfaces";

export interface GraphDef {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface GraphOptions {
	symlinkEdges: boolean;
	direntEdges: boolean;
}

export const defaultGraphOptions: GraphOptions = {
	symlinkEdges: true,
	direntEdges: true,
};

export type FSTransaction<T = any> = (fs: Filesystem) => T;
export type FSTXDispatcher = <T>(tx: FSTransaction<T>) => T;

export function useFilesystem(): [IReadonlyFilesystem, FSTXDispatcher, number] {
	const [fs] = useState(createFilesystem);
	const [version, incrementVersion] = useReducer((s: number) => s + 1, 0);
	const dispatchTX = useCallback(<T>(tx: FSTransaction<T>) => {
		incrementVersion();
		return tx(fs);
	}, []);
	return [fs, dispatchTX, version];
}

function createFilesystem(): Filesystem {
	const fs = new Filesystem();
	fs.mkdir("/etc");
	fs.mkdir("/home");
	fs.mkdir("/bin");
	fs.createFile(
		"/etc/shadow",
		"root:!:17497::\nmon:*:17457::\nbin:*:17457::"
	);
	const pseudoBinary =
		"1010011100\n0000111101\n0100101000\n0000000110\n1101101100\n0000111010\n0111110100\n1000101111\n1110111101\n0111011100";
	fs.createFile("/bin/ls", pseudoBinary);
	fs.createFile("/bin/cat", pseudoBinary);
	fs.createFile("/bin/echo", pseudoBinary);
	fs.symlink("/bin/python", "/home/broken");
	fs.link("/etc/shadow", "/home/schatten");
	fs.symlink("/bin/ls", "/home/list");
	return fs;
}

type FSContext = { fs: IReadonlyFilesystem; dispatch: FSTXDispatcher };

const fsCtx = createContext<FSContext | null>(null);
export const FSProvider = fsCtx.Provider;
export function useFSContext(): FSContext {
	const ctx = useContext(fsCtx);
	if (!ctx) throw new Error("no fs context");
	return ctx;
}

export function useFSGraph(
	fs: IReadonlyFilesystem,
	options: GraphOptions,
	version: number
): GraphDef {
	return useMemo(() => deriveGraph(fs, options), [version, fs, options]);
}

function deriveGraph(fs: IReadonlyFilesystem, options: GraphOptions): GraphDef {
	const edges: GraphDef["edges"] = [];
	const nodes: GraphDef["nodes"] = [];

	for (const inode of fs.inodes.values()) {
		const idStr = inode.id.toString();
		const node: GraphNode = {
			id: idStr,
			label: idStr,
		};

		if (inode.type === FileType.Directory) {
			node.fill = "#D8E6DF";
			if (options.direntEdges) {
				for (const [filename, target] of inode.entries) {
					if (filename === "." || filename === "..") continue;
					edges.push({
						id: `${inode.id}-${target.id}`,
						source: idStr,
						target: target.id.toString(),
						label: filename,
						labelVisible: true,
					});
				}
			}
		} else if (inode.type === FileType.Symlink) {
			try {
				const target = fs.resolvePath(inode.target, {
					followSymlinks: false,
				});
				node.fill = "#EBE3C7";
				if (options.symlinkEdges) {
					edges.push({
						id: `symlink-${idStr}`,
						source: idStr,
						target: target.id.toString(),
						size: 1,
					});
				}
			} catch (e) {
				if (!(e instanceof ErrnoError)) throw e;
				node.fill = "#ffcccc";
			}
		} else {
			node.fill = "#C9D3E1";
		}

		nodes.push(node);
	}

	return { nodes, edges };
}
