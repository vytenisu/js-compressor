export interface IFileMap {
	[inputFile: string]: string
}

export interface ILazifierArgs {
	path?: string
	output?: string
	exclude?: RegExp[]
	min?: number
	cli?: boolean
}
