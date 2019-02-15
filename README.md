# JS LazyFire

by Vytenis Urbonavičius

<span style="color: red">**WARNING:**</span> - this package is an experiment - benefits are not proven!

## Purpose

**_JS LazyFire_** is a tool for converting JS files to make them parse-able in a lazy way.
This has potential to improve initial load time of the application.

**Assumptions:**

- _eval_ is optimized in JS engine of choice
- launching application does not require most of the code to be executed at once

**Important!** Before making a decision to use **_JS LazyFire_** in your project, please make sure your application is tested to verify cost on runtime performance and whether code still works correctly.

## How it works

- **JS LazyFire** uses **Terser** to minify all targeted JS files
- Minimized JS files are parsed into AST trees
- AST is used to extract body of large functions
- Bodies of large functions are put into closures and wrapped using _eval_.

Current method of selecting which functions to transform by their code size is not optimal because well-written projects may only have small well-decoupled methods. However, this method is fit for some projects and allows to verify the concept. Algorithm has place for improvement.

## CLI usage

When running command without any parameters you will be presented full CLI usage information:

```bash
lazyfire
```

Single file transformation:

```bash
lazyfire -p file.js lazify
```

Recursive transformation of all JS files in a directory:

```bash
lazyfire -p /some/directory lazify
```

Some of the available additional parameters:

- **-e** - exclude paths
- **-o** - output path
- **-m** - minimum size of function body in characters to qualify for transformation
- _more information available when running command without parameters_

## Module usage

<span style="color: red">NOT FINISHED</span>
