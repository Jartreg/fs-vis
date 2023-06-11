import { useState } from "react";
import { ErrnoError } from "./errno";
import { Filesystem } from "./fs-impl";
import { FileType } from "./fs-interfaces";
import { FSTXDispatcher, useFSContext } from "./fs-react";
import { splitPath } from "./fs-utils";

type Result = { success: true; msg?: string } | { success: false; msg: string };

export function Terminal() {
	const { dispatch } = useFSContext();
	const [cmd, setCmd] = useState("");
	const [result, setResult] = useState<Result | null>(null);

	return (
		<div
			className={
				"panel terminal" +
				(result?.success === false ? " terminal__error" : "")
			}
		>
			<form
				action=""
				onSubmit={(e) => {
					e.preventDefault();
					setResult(null);
					if (!cmd || cmd.trim().length === 0) return;

					setCmd("");
					try {
						setResult(runCommand(cmd, dispatch));
					} catch (e) {
						if (e instanceof CommandError)
							setResult({ success: false, msg: e.message });
					}
				}}
			>
				<input
					type="text"
					value={cmd}
					onInput={(e) => {
						setResult(null);
						setCmd(e.currentTarget.value);
					}}
				/>
				<div className="terminal--result">{result?.msg}</div>
			</form>
		</div>
	);
}

const commands: Record<
	string,
	(args: string[], fs: Filesystem) => Result | string | void
> = {
	ln(args, fs) {
		let symbolic = false;
		let pathArgs: string[] = [];

		for (const arg of args) {
			switch (arg) {
				case "-s":
					symbolic = true;
					break;
				default:
					if (arg.startsWith("-"))
						throw new CommandError(`Unknown option "${arg}"`);
					pathArgs.push(arg);
					break;
			}
		}

		if (pathArgs.length === 0)
			throw new CommandError("usage: ln [-s] sources... target");
		if (pathArgs.length === 1)
			throw new CommandError("missing destination");

		try {
			if (pathArgs.length === 2) {
				let dest = pathArgs[1];
				try {
					const destInode = fs.resolvePath(dest);
					if (destInode.type === FileType.Directory)
						dest = combineTargetName(pathArgs[0], dest);
				} catch (ignored) {}

				if (symbolic) fs.symlink(pathArgs[0], dest);
				else fs.link(pathArgs[0], dest);
			} else {
				const sources = pathArgs.slice(0, -1);
				const destDir = pathArgs.at(-1)!;

				for (const src of sources) {
					const dest = combineTargetName(src, destDir);
					if (symbolic) fs.symlink(src, dest);
					else fs.link(src, dest);
				}
			}
		} catch (e) {
			if (e instanceof ErrnoError)
				throw new CommandError(symbolic ? "symlink" : "link", e);
		}
	},
	rm(args, fs) {
		try {
			for (const file of args) {
				fs.remove(file);
			}
		} catch (e) {
			if (e instanceof ErrnoError) throw new CommandError("remove", e);
		}
	},
	mkdir(args, fs) {
		if (args.length !== 1)
			throw new CommandError("usage: mkdir directory_name");
		try {
			fs.mkdir(args[0]);
		} catch (e) {
			if (e instanceof ErrnoError) throw new CommandError("mkdir", e);
		}
	},
	echo(args, fs) {
		let redirectIndex = args.indexOf(">");
		if (redirectIndex === -1) redirectIndex = args.length;
		const concatenated = args.slice(0, redirectIndex).join(" ") + "\n";

		if (redirectIndex < args.length) {
			const target = args.at(redirectIndex + 1);
			if (!target) throw new CommandError("Expected target file");
			fs.createOrWriteFile(target, concatenated);
		} else {
			return concatenated.trim();
		}
	}
};

function combineTargetName(src: string, destDir: string) {
	const name = src.length > 0 ? splitPath(src).at(-1) : ".";
	return destDir + "/" + name;
}

function runCommand(cmd: string, dispatch: FSTXDispatcher) {
	const tokens = tokenise(cmd);
	if (!tokens) throw new CommandError("could not parse command");
	if (!commands.hasOwnProperty(tokens[0]))
		throw new CommandError(`Unknown command "${tokens[0]}"`);

	let result = dispatch((fs) => commands[tokens[0]](tokens.slice(1), fs));
	if (!result || typeof result === "string") {
		result = {
			success: true,
			msg: result ?? undefined,
		};
	}

	return result;
}

const tokenRegex = /^\s*("(?:\\.|[^"\\]|)*"|[^"\s]+)\s*/;

function tokenise(cmd: string): string[] | null {
	const tokens: string[] = [];
	while (cmd.length > 0) {
		const match = cmd.match(tokenRegex);
		if (!match) return null;
		cmd = cmd.slice(match[0].length);

		let token = match[1];
		if (token.startsWith(`"`)) {
			token = token.slice(1, -1);
			let valid = true;
			token.replace(/\\./g, (substr) => {
				switch (substr) {
					case `\\"`:
						return `"`;
					case "\\n":
						return "\n";
					default:
						valid = false;
						return "";
				}
			});
			if (!valid) return null;
		}
		tokens.push(token);
	}

	return tokens;
}

class CommandError extends Error {
	constructor(msg: string, cause?: ErrnoError) {
		super(cause ? `${msg}: ${cause.message}` : msg);
	}
}
