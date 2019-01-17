import traverse from 'ast-traverse'
import * as esprima from 'esprima'
import * as fs from 'fs'
import * as mkdirp from 'mkdirp'
import * as path from 'path'
import recursive from 'recursive-readdir'
import * as Terser from 'terser'
import { ICliArguments } from '../lib/cli.interfaces'
import { Cli } from './cli'
import { IFileMap, ILazifierArgs } from './lazifier.interfaces'

const SUPPORTED_EXTENSION = 'js'

export class Lazifier extends Cli {

	public constructor( options: ILazifierArgs = {} ) {
		super( !!options.cli )

		Object.keys( options ).forEach( key => {
			this.setArgument( key as ICliArguments, (options as any)[key] )
		} )

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
			this.ensureDirectoryExists( outputFile )

			if ( inputFile.endsWith( `.${SUPPORTED_EXTENSION}` ) ) {
				this.lazifyFile( inputFile, outputFile )
			} else {
				this.copyFile( inputFile, outputFile )
			}

			this.increaseProgress()
		})

		this.displayCompleted()
	}

	private copyFile( from: string, to: string ) {
		const data = fs.readFileSync( from, { encoding: 'utf-8' })
		fs.writeFileSync( to, data, { encoding: 'utf-8' } )
	}

	private ensureDirectoryExists( outputFile: string ) {
		const dir = path.dirname( outputFile )
		mkdirp.sync( dir )
	}

	private async getTargetFiles(): Promise<string[]> {
		const targetPath = this.getArgument( 'path' )

		if ( this.inputIsFile() ) {
			return [ path.resolve( targetPath ) ]
		} else {
			return await this.scanDirectorySources( targetPath )
		}
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
					files = this.filterOutIgnored( files )
					resolve( files )
				}
			} )
		} )
	}

	private minifyCode( inputPath: string, code: string ) {
		return Terser.minify( { [inputPath]: code }, {
			keep_classnames: true,
			keep_fnames: true,
		} ).code || ''
	}

	private parseToAst( code: string, filePath?: string, fragment = false ) {
		try {
			if ( fragment ) {
				return esprima.parseScript(code, { loc: true })
			} else {
				return esprima.parseModule(code, { loc: true })
			}
		} catch ( e ) {
			if ( !filePath ) {
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

	private getNodeStart( node: esprima.Token, offset: number ) {
		return ( node as any).loc.start.column + offset
	}

	private getNodeEnd( node: esprima.Token, offset: number ) {
		return ( node as any).loc.end.column + offset
	}

	private lazifyCode( initialCode: string, inputPath: string, fragment = false ) {
		let code = fragment ? initialCode : this.minifyCode( inputPath, initialCode )

		let changed = true
		const parsedPositions: number[] = []

		const ast = this.parseToAst( code, inputPath, fragment )

		if ( !ast ) {
			return code
		}

		let offset = 0
		let minPosition = 0
		let firstBlock = true

		while ( changed ) {
			changed = false
			const stack: string[] = []

			try {
				traverse( ast, {
					pre: ( node: esprima.Token, parent: esprima.Token ) => {
						const allowedParents = [
							'FunctionExpression',
							'FunctionDeclaration',
							'ArrowFunctionExpression',
						]

						if ( node.type === 'BlockStatement' && allowedParents.includes( parent.type ) ) {
							if ( !fragment || !firstBlock ) {
								if ( this.getNodeStart( node, 0 ) >= minPosition ) {
									if ( this.getNodeEnd( node, 0 ) - this.getNodeStart( node, 0 ) >= this.getArgument( 'min' ) ) {
										if ( !parsedPositions.includes( this.getNodeStart( node, 0 ) ) ) {
											parsedPositions.push( this.getNodeStart( node, 0 ) )
											throw { type: 'break', node }
										} else {
											return false
										}
									}
								}
							} else if ( fragment ) {
								firstBlock = false
							}
						}

						stack.push( node.type )
						return true
					},
					post: () => {
						stack.pop()
					},
				} )
			} catch ( e ) {
				if ( e && e.type === 'break' ) {
					const initialCodeFragment = code.substring(
						this.getNodeStart( e.node, offset ) + 1,
						this.getNodeEnd( e.node, offset ) - 1,
					)

					let codeFragment = initialCodeFragment

					const wrapPrefix = '(function(){'
					const wrapPostfix = '})()'
					const wrappedCodeFragment = `${wrapPrefix}${codeFragment}${wrapPostfix}`

					const lazifiedInnerCode = this.lazifyCode( wrappedCodeFragment, inputPath, true )

					if ( lazifiedInnerCode !== wrappedCodeFragment ) {
						codeFragment = lazifiedInnerCode.substring( wrapPrefix.length, lazifiedInnerCode.length - wrapPostfix.length )
					}

					const lazifiedFragment = `return eval('(function(){${this.escapeString( codeFragment )}})').apply(this);`

					code =
						code.substring( 0, this.getNodeStart( e.node, offset ) + 1 ) +
						lazifiedFragment +
						code.substring( this.getNodeEnd( e.node, offset ) - 1 )

					const additionalOffset = lazifiedFragment.length - initialCodeFragment.length
					minPosition += this.getNodeEnd( e.node, 0 )
					offset += additionalOffset

					changed = true
				} else {
					throw e
				}
			}
		}

		if ( !fragment ) {
			code = this.minifyCode( inputPath, code )
		}

		try {
			this.parseToAst( code, undefined, fragment )
			return code
		} catch ( e ) {
			return initialCode
		}

	}

	private lazifyFile( inputPath: string, outputPath: string ) {
		const initialCode = fs.readFileSync( inputPath, { encoding: 'utf-8' } )
		const code = this.lazifyCode( initialCode, inputPath )
		fs.writeFileSync( outputPath, code, { encoding: 'utf-8' } )
	}

}
