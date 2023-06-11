import { POSIX_SYMLOOP_MAX, splitPath, isEmptyPath } from "./fs-utils";
import {
	EEXIST,
	EINVAL,
	EISDIR,
	ELOOP,
	ENOENT,
	ENOTDIR,
	ENOTEMPTY,
	EPERM,
} from "./errno";
import {
	FileType,
	IDirectory,
	IFile,
	IReadonlyFilesystem,
	ISymlink,
	Inode,
	ResolveOptions,
} from "./fs-interfaces";

const file = (id: number, data: string): IFile => ({
	id,
	linkCount: 0,
	type: FileType.Regular,
	data,
});

const symlink = (id: number, target: string): ISymlink => ({
	id,
	linkCount: 0,
	type: FileType.Symlink,
	target,
});

const directory = (id: number): IDirectory => {
	const dir: IDirectory = {
		id,
		linkCount: 1,
		type: FileType.Directory,
		entries: new Map(),
	};
	dir.entries.set(".", dir);
	return dir;
};

function setParent(target: IDirectory, newParent: IDirectory) {
	const prevParent = target.entries.get("..");
	if (prevParent) prevParent.linkCount--;

	target.entries.set("..", newParent);
	newParent.linkCount++;
}

export class Filesystem implements IReadonlyFilesystem {
	readonly inodes = new Map<number, Inode>();
	readonly root: IDirectory;

	constructor() {
		this.root = directory(2);
		this.inodes.set(2, this.root);
		setParent(this.root, this.root);
	}

	private nextInodeId(): number {
		let i = 2;
		while (this.inodes.has(i)) i++;
		return i;
	}

	writeFile(path: string, newData: string) {
		const inode = this.resolvePath(path);
		this.writeToInode(inode, newData);
	}

	createOrWriteFile(path: string, newData: string) {
		const [parent, filename] = this.resolveFinal(path); // symlink behaviour follows macOS
		const existing = parent.entries.get(filename);
		if (existing) {
			this.writeToInode(existing, newData);
		} else {
			const newFile = file(this.nextInodeId(), newData);
			this.createLink(parent, filename, newFile);
		}
	}

	createFile(path: string, data: string) {
		const [parent, filename] = this.resolveFinal(path, {
			followSymlinks: false,
		});
		if (parent.entries.has(filename)) throw new EEXIST();
		this.createLink(parent, filename, file(this.nextInodeId(), data));
	}

	link(path1: string, path2: string) {
		const inode = this.resolvePath(path1, { followSymlinks: false }); // linux behaviour, conforms to POSIX 2008
		if (inode.type === FileType.Directory) throw new EPERM();
		const [targetDir, targetName] = this.resolveFinal(path2, {
			followSymlinks: false,
		});
		this.createLink(targetDir, targetName, inode);
	}

	symlink(path1: string, path2: string) {
		const [parent, filename] = this.resolveFinal(path2, {
			followSymlinks: false,
		});
		this.createLink(parent, filename, symlink(this.nextInodeId(), path1));
	}

	remove(path: string) {
		this.removeAt(...this.resolveFinal(path, { followSymlinks: false }));
	}

	removeAt(parent: IDirectory, filename: string) {
		return parent.entries.get(filename)?.type === FileType.Directory
			? this.rmdirAt(parent, filename)
			: this.unlinkAt(parent, filename);
	}

	unlink(path: string) {
		this.unlinkAt(...this.resolveFinal(path, { followSymlinks: false }));
	}

	unlinkAt(parent: IDirectory, filename: string) {
		const inode = parent.entries.get(filename);
		if (!inode) throw new ENOENT();
		if (inode.type === FileType.Directory) throw new EPERM(); // linux sets EISDIR

		parent.entries.delete(filename);
		if (--inode.linkCount === 0) this.inodes.delete(inode.id);
	}

	rmdir(path: string) {
		this.rmdirAt(...this.resolveFinal(path, { followSymlinks: false }));
	}

	rmdirAt(parent: IDirectory, filename: string) {
		if (filename === ".") throw new EINVAL();
		const inode = parent.entries.get(filename);
		if (!inode) throw new ENOENT();
		if (inode.type !== FileType.Directory) throw new ENOTDIR();
		if (inode.entries.size > 2) throw new ENOTEMPTY();

		parent.entries.delete(filename);
		this.inodes.delete(inode.id);
		parent.linkCount--;
	}

	mkdir(path: string) {
		const [parent, filename] = this.resolveFinal(path, {
			followSymlinks: false,
		});
		if (parent.entries.has(filename)) throw new EEXIST();
		const dir = directory(this.nextInodeId());
		this.createLink(parent, filename, dir);
		setParent(dir, parent);
	}

	private createLink(parent: IDirectory, filename: string, inode: Inode) {
		if (parent.entries.has(filename)) throw new EEXIST();
		this.inodes.set(inode.id, inode);
		parent.entries.set(filename, inode);
		inode.linkCount++;
	}

	private writeToInode(inode: Inode, newData: string) {
		if (inode.type === FileType.Directory) throw new EISDIR();
		if (inode.type !== FileType.Regular) throw new Error("file expected");
		inode.data = newData;
	}

	// https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html#tag_04_13
	resolveFinal(
		path: string | string[],
		{
			cwd = this.root,
			followSymlinks = true,
			remainingSymlinkTraversals = POSIX_SYMLOOP_MAX,
		}: ResolveOptions = {}
	): [IDirectory, string] {
		if (typeof path === "string") path = splitPath(path);

		// https://pubs.opengroup.org/onlinepubs/9699919799/functions/open.html
		if (isEmptyPath(path)) throw new ENOENT();

		let predecessor = cwd;
		if (path[0] === "") {
			path.shift();
			predecessor = this.root;
		}

		let filename: string | undefined;
		while (path.length > 1 && (filename = path.shift())) {
			let inode = predecessor.entries.get(filename);
			if (!inode) throw new ENOENT();

			switch (inode.type) {
				case FileType.Symlink:
					if (remainingSymlinkTraversals === 0) throw new ELOOP();
					remainingSymlinkTraversals--;

					const linkedPath = splitPath(inode.target);
					if (isEmptyPath(linkedPath)) throw new ENOENT();

					// ignore trailing slashes
					if (linkedPath.at(-1) === "") linkedPath.pop();

					// handle leading slash
					if (linkedPath[0] == "") {
						linkedPath.shift();
						predecessor = this.root;
					}

					path.unshift(...linkedPath);
					break;
				case FileType.Directory:
					predecessor = inode;
					break;
				default:
					throw new ENOTDIR();
			}
		}

		if (followSymlinks) {
			const inode = predecessor.entries.get(path[0]);
			if (inode?.type === FileType.Symlink) {
				if (remainingSymlinkTraversals === 0) throw new ELOOP();
				remainingSymlinkTraversals--;

				return this.resolveFinal(inode.target, {
					cwd,
					followSymlinks,
					remainingSymlinkTraversals,
				});
			}
		}

		return [predecessor, path[0]];
	}

	resolvePath(
		path: string | string[],
		{
			followSymlinks = true,
			remainingSymlinkTraversals = POSIX_SYMLOOP_MAX,
			...restOptions
		}: ResolveOptions = {}
	): Inode {
		const [parent, filename] = this.resolveFinal(path, {
			followSymlinks,
			remainingSymlinkTraversals,
			...restOptions,
		});
		if (filename === "" || filename === ".") return parent;

		const inode = parent.entries.get(filename);
		if (!inode) throw new ENOENT();

		if (followSymlinks && inode.type === FileType.Symlink) {
			if (remainingSymlinkTraversals === 0) throw new ELOOP();
			remainingSymlinkTraversals--;
			return this.resolvePath(inode.target, {
				followSymlinks,
				remainingSymlinkTraversals,
				...restOptions,
			});
		}

		return inode;
	}
}
