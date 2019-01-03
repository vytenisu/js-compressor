import traverse from 'ast-traverse'
import * as esprima from 'esprima'
import * as fs from 'fs'
import * as path from 'path'
import recursive from 'recursive-readdir'
import * as Terser from 'terser'
import { Cli } from './cli'

const MIN_FUNCTION_SIZE = 100
const SUPPORTED_EXTENSION = 'js'

export interface IFileMap {
	[inputFile: string]: string
}

export class Lazifier extends Cli {

	public constructor() {
		super()

		this.getTargetFiles().then( files => {
			const fileMap = this.prepareFileMap( files )
			this.showProgress( Object.keys( fileMap ).length )
			this.lazifyFiles( fileMap )
		} )
	}

	private prepareFileMap( files: string[] ) {
		const input = this.getArgument( 'path' )
		const output = this.getArgument( 'output' )

		if ( this.inputIsFile() ) {
			return {
				[files[0]]: path.resolve( output, path.basename( files[0] ) ),
			}
		} else {

			const fileMap: IFileMap = {}

			files.forEach( file => {
				const relativeFile = file.substring( input.length + 1 )
				const outputFile = path.resolve( output, relativeFile )
				fileMap[file] = outputFile
			} )

			return fileMap
		}
	}

	private inputIsFile() {
		const targetPath = this.getArgument( 'path' )
		return targetPath.endsWith( `.${SUPPORTED_EXTENSION}` )
	}

	private lazifyFiles( fileMap: IFileMap ) {
		Object.entries( fileMap ).forEach( ( [inputFile, outputFile] ) => {
			this.lazifyFile( inputFile, outputFile )
			this.increaseProgress()
		})
	}

	private async getTargetFiles(): Promise<string[]> {
		const targetPath = this.getArgument( 'path' )

		if ( this.inputIsFile() ) {
			return [ path.resolve( targetPath ) ]
		} else {
			return await this.scanDirectorySources( targetPath )
		}
	}

	private filterSources( files: string[] ) {
		return files.filter( file => file.endsWith( `.${SUPPORTED_EXTENSION}` ) )
	}

	private filterOutIgnored( files: string[] ) {
		const expressions = this.getArgument( 'exclude' )

		files = files.filter( file => {
			for ( const expression of expressions ) {
				if ( expression.test( file ) ) {
					return false
				}
			}

			return true
		} )

		return files
	}

	private scanDirectorySources( dirPath: string ): Promise<string[]> {
		return new Promise( ( resolve, reject ) => {
			recursive( dirPath, ( err, files ) => {
				if ( err ) {
					reject( err )
				} else {
					files = this.filterSources( files )
					files = this.filterOutIgnored( files )
					resolve( files )
				}
			} )
		} )
	}

	private minifyCode( inputPath: string, code: string ) {
		return Terser.minify( { [inputPath]: code } ).code || ''
	}

	private parseToAst( code: string, filePath?: string ) {
		try {
			return esprima.parseModule(code, { loc: true })
		} catch ( e ) {
			if ( !filePath ) {
				console.log( `Fatal error when parsing: ${filePath}\n\n` )
				throw e
			}

			return null
		}
	}

	private escapeString( data: string ) {
		let escaped = ''

		for ( const c of data ) {
			const escapedCharacters = ['\\', '\'']

			if ( escapedCharacters.includes( c ) ) {
				escaped += '\\'
			}

			escaped += c
		}

		return escaped
	}

	private lazifyFile( inputPath: string, outputPath: string ) {
		let code = fs.readFileSync( inputPath, { encoding: 'utf-8' } )

		code = this.minifyCode( inputPath, code )

		let changed = true

		const parsedPositions: number[] = []
		let ast = this.parseToAst( code, inputPath )

		if ( !ast ) {
			// fs.writeFileSync( outputPath, code, { encoding: 'utf-8' } )
		}

		while ( changed ) {
			changed = false

			try {
				traverse( ast, { pre: ( node: esprima.Token, parent: esprima.Token ) => {
					const allowedParents = [
						'FunctionExpression',
						'ArrowFunctionExpression',
					]

					if ( node.type === 'BlockStatement' && allowedParents.includes( parent.type ) ) {
						if ( !parsedPositions.includes( ( node as any).loc.start.column ) ) {
							parsedPositions.push( ( node as any).loc.start.column )
							throw { type: 'break', node }
						}
					}
				} } )
			} catch ( e ) {
				if ( e && e.type === 'break' ) {
					const codeFragment = code.substring( e.node.loc.start.column + 1, e.node.loc.end.column - 1 )

					if ( codeFragment.length > MIN_FUNCTION_SIZE ) {
						const lazifiedFragment = `return eval('(function(){${this.escapeString( codeFragment )}})()')`

						code =
							code.substring( 0, e.node.loc.start.column + 1 ) +
							lazifiedFragment +
							code.substring( e.node.loc.end.column - 1 )

						ast = this.parseToAst( code )
					}

					changed = true
				} else {
					throw e
				}
			}
		}

		code = this.minifyCode( inputPath, code )
		// fs.writeFileSync( outputPath, code, { encoding: 'utf-8' } )
	}

}
