export const enum FileType {
	Regular,
	Directory,
	Symlink,
}

export interface IInode<T extends FileType> {
	readonly id: number;
	readonly type: T;
	linkCount: number;
}

export type Inode = IFile | ISymlink | IDirectory;

export interface IFile extends IInode<FileType.Regular> {
	data: string;
}

export interface ISymlink extends IInode<FileType.Symlink> {
	readonly target: string;
}

export interface IDirectory extends IInode<FileType.Directory> {
	readonly entries: Map<string, Inode>;
}

export type ResolveOptions = {
	cwd?: IDirectory;
	followSymlinks?: boolean;
	remainingSymlinkTraversals?: number;
};

export interface IReadonlyFilesystem {
	readonly root: IDirectory;
	readonly inodes: ReadonlyMap<number, Inode>;

	resolvePath(path: string | string[], options?: ResolveOptions): Inode;
	resolveFinal(
		path: string | string[],
		options?: ResolveOptions
	): [IDirectory, string];
}
