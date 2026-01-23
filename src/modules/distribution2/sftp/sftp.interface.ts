export type SftpListItem = {
	/** '-' = file | 'd' = directory | 'l' = symlink */
	type: '-' | 'd' | 'l';

	/** File / directory name */
	name: string;

	/** Size in bytes (directory thường là 4096) */
	size: number;

	/** Last modified time (unix timestamp in ms) */
	modifyTime: number;

	/** Last access time (unix timestamp in ms) */
	accessTime: number;

	/** Permission bits */
	rights: {
		user: string;
		group: string;
		other: string;
	};

	/** Owner user id */
	owner: number;

	/** Group id */
	group: number;

	/** Raw long format (like `ls -l`) */
	longname: string;
};
