import * as args from 'args'
import * as path from 'path'
import * as Progress from 'progress'
import { ICliArguments } from './cli.interfaces'

export class Cli {

	protected launched = false
	protected progress: Progress | null = null

	private lazifierArgs: { [name: string]: any } = {
		path: path.resolve(process.cwd()),
		output: path.resolve(process.cwd(), 'output'),
		exclude: '',
	}

	public constructor() {
		args
			.option( ['p', 'path'], 'File or directory path (cwd is used if not provided)', this.lazifierArgs.path )
			.option( ['o', 'output'], 'Custom output directory ("output" directory used otherwise)', this.lazifierArgs.output )
			.option( ['e', 'exclude'], 'Excluded path regular expressions, separated by ";"', this.lazifierArgs.exclude )
			.command( 'lazify', 'Start lazification', ( name, sub, options ) => {
				this.launched = true
				this.storeArguments( options )
			} )
			.example(
				'js-lazifier lazify',
				'Lazifies all JS files under CWD directory',
			)
			.example(
				'js-lazifier -p test.js lazify',
				'Lazifies "test.js" file and produces result in "output" directory of CWD.',
			)
			.example(
				'js-lazifier -p /my-project -e node_modules;build -d -o build lazify',
				'Lazifies all JS files under "/my-project" except for "node_modules" and "build" directories.\n' +
				'Lazifies file is configured not to be self-extracting unless extraction code is already in global scope.\n' +
				'"build" directory is configured to be used for placing generated files.',
			)

		args.parse(process.argv, {
			name: 'js-lazifier',
			mri: {},
			mainColor: 'yellow',
			subColor: 'dim',
		})

		if ( !this.launched ) {
			args.showHelp()
		}
	}

	public showProgress( total: number ) {
		this.progress = new Progress( 'Lazifying [:bar] :percent :etas', { total } )
	}

	public increaseProgress() {
		if ( this.progress ) {
			this.progress.tick( 1 )
		}
	}

	public getArgument( arg: ICliArguments ) {
		return this.lazifierArgs[arg]
	}

	private parseExcludes( excludeString: string ) {
		if ( !excludeString.length ) {
			return []
		}

		const excludes = excludeString.split( ';' )
		const excludeExpressions = excludes.map(exclude => new RegExp( exclude ) )

		return excludeExpressions
	}

	private storeArguments( passedArguments: any ) {
		for ( const argName of Object.keys( this.lazifierArgs ) ) {
			this.lazifierArgs[argName] = Object.is( passedArguments[argName], undefined )
				? this.lazifierArgs[argName]
				: passedArguments[argName]

			if ( argName === 'exclude' ) {
				this.lazifierArgs[argName] = this.parseExcludes( this.lazifierArgs[argName] )
			}
		}
	}

}
