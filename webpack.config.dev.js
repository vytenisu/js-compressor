const webpack = require('webpack')
const nodeExternals = require('webpack-node-externals')

const exportedConfig = {
	entry: {
		index: __dirname + '/index.ts',
		cli: __dirname + '/cli.ts'
	},
	target: 'node',
	externals: [nodeExternals()],
	devtool: 'inline-source-map',
	mode: 'development',
	resolve: {
		extensions: ['.webpack.js', '.web.js', '.ts', '.js']
	},
	output: {
		path: __dirname + '/dist',
		filename: '[name].js',
		sourceMapFilename: '[name].js.map',
		libraryTarget: 'commonjs2'
	},
	resolveLoader: {
		modules: [__dirname + '/node_modules']
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							configFile: __dirname + '/tsconfig.json'
						}
					}
				]
			}
		]
	}
}

module.exports = exportedConfig
