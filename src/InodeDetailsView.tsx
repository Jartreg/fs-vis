import { useSelectInode } from "./App";
import { FileType, IDirectory, IFile, Inode } from "./fs-interfaces";
import { useFSContext } from "./fs-react";

interface InodeDetailsViewProps {
	inode: Inode;
}

export function InodeDetailsView({ inode }: InodeDetailsViewProps) {
	const { fs } = useFSContext();

	const typeCls =
		inode.type === FileType.Directory
			? "dir"
			: inode.type === FileType.Symlink
			? "symlink"
			: "regular";

	const title =
		inode === fs.root
			? "Root Directory"
			: inode.type === FileType.Directory
			? "Directory"
			: inode.type === FileType.Symlink
			? "Symbolic Link"
			: "Regular File";

	return (
		<div className={`inode-details panel inode-details__${typeCls}`}>
			<h2>{title}</h2>
			<div className="inode-details--content">
				<dl>
					<dt>Link Count</dt>
					<dd>{inode.linkCount}</dd>
					{inode.type === FileType.Symlink && (
						<>
							<dt>Target</dt>
							<dd>
								<code>{inode.target}</code>
							</dd>
						</>
					)}
				</dl>
				{inode.type === FileType.Regular ? (
					<FileContentView file={inode} />
				) : inode.type === FileType.Directory ? (
					<DirectoryListing dir={inode} />
				) : null}
			</div>
		</div>
	);
}

function FileContentView({ file }: { file: IFile }) {
	return (
		<>
			<h3>Content</h3>
			<pre>
				<code>{file.data}</code>
			</pre>
		</>
	);
}

function DirectoryListing({ dir }: { dir: IDirectory }) {
	const selectInode = useSelectInode();
	const { dispatch } = useFSContext();

	return (
		<>
			<h3>Entries</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Inode</th>
					</tr>
				</thead>
				<tbody>
					{[...dir.entries.entries()].map(([name, inode]) => (
						<tr key={name} onClick={() => selectInode(inode)}>
							<td>
								<code>{name}</code>
							</td>
							<td>{inode.id}</td>
							<td>
								{name !== "." && name !== ".." && (
									<button
										disabled={
											inode.type === FileType.Directory &&
											inode.entries.size !== 2
										}
										onClick={(e) => {
											e.stopPropagation();
											dispatch((fs) =>
												fs.removeAt(dir, name)
											);
										}}
									>
										Delete
									</button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
