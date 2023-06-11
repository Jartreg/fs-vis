
export abstract class ErrnoError extends Error { }

export class ENOENT extends ErrnoError {
	constructor() {
		super("No such file or directory");
	}
}

export class EISDIR extends ErrnoError {
	constructor() {
		super("Is a directory");
	}
}

export class ENOTDIR extends ErrnoError {
	constructor() {
		super("Not a directory");
	}
}

export class ELOOP extends ErrnoError {
	constructor() {
		super("Too many levels of symbolic links");
	}
}

export class EEXIST extends ErrnoError {
	constructor() {
		super("File exists");
	}
}

export class EPERM extends ErrnoError {
	constructor() {
		super("Operation not permitted");
	}
}

export class EINVAL extends ErrnoError {
	constructor() {
		super("Invalid argument");
	}
}

export class ENOTEMPTY extends ErrnoError {
	constructor() {
		super("Directory not empty");
	}
}
