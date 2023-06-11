// https://unix.stackexchange.com/a/1919
// https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_271
export const splitPath = (path: string) => path.split(/\/+/);

export const isEmptyPath = (path: string[]) =>
	path.length === 1 && path[0] === "";

export const POSIX_SYMLOOP_MAX = 8; // limits.h
