import {Callback, CompilerPluginObject, Embark, Plugins} from "embark";
import {__} from "i18n";
import {promisify} from "util";

const async = require("./utils/async_extend.js");

class Compiler {
  private logger: any;
  private plugins: Plugins;
  private isCoverage: boolean;

  constructor(embark: Embark, options: any) {
    this.logger = embark.logger;
    this.plugins = options.plugins;
    this.isCoverage = options.isCoverage;

    embark.events.setCommandHandler("compiler:contracts", this.compile_contracts.bind(this));
  }

  private compile_contracts(contractFiles: any[], cb: any) {
    if (contractFiles.length === 0) {
      return cb(null, {});
    }

    const compiledObject: {[index: string]: any} = {};

    const compilerOptions = {
      isCoverage: this.isCoverage,
    };

    (async () => {
      let err = null;
      try {
        await Promise.all(
          // parallel exec in map
          Object.entries(this.getAvailableCompilers()).map(
            async ([extension, compilers]) => {
              const matchingFiles = contractFiles.filter(
                this.filesMatchingExtension(extension)
              );
              if (matchingFiles.length === 0) { return; }

              const runCompilers = function*() {
                for (const compiler of compilers) {
                  yield promisify(compiler)(matchingFiles, compilerOptions);
                }
              };

              let result;
              // serial exec in for-await...of
              for await (result of runCompilers()) {
                if (result !== false) { break; }
              }

              if (!result) {
                // No compiler was compatible
                throw new Error(__([
                  `No installed compiler was compatible with your version of`,
                  `${extension} files.`
                ].join(' ')))
              }

              Object.assign(compiledObject, result);
            }
          )
        );
      } catch (e) {
        err = e;
      } finally {
        contractFiles.filter((f: any) => !f.compiled).forEach(
          (file: any) => {
            this.logger.warn(__([
              `${file.path} doesn't have a compatible contract compiler.`,
              `Maybe a plugin exists for it.`
            ].join(' ')));
          }
        );

        cb(err, compiledObject);
      }
    })();
  }

  private getAvailableCompilers() {
    const available_compilers: { [index: string]: any } = {};
    this.plugins.getPluginsProperty("compilers", "compilers").forEach((compilerObject: CompilerPluginObject) => {
      if (!available_compilers[compilerObject.extension]) {
        available_compilers[compilerObject.extension] = [];
      }
      available_compilers[compilerObject.extension].unshift(compilerObject.cb);
    });
    return available_compilers;
  }

  private filesMatchingExtension(extension: string) {
    return (file: any) => {
      const fileMatch = file.path.match(/\.[0-9a-z]+$/);
      if (fileMatch && (fileMatch[0] === extension)) {
        file.compiled = true;
        return true;
      }
      return false;
    };
  }
}

module.exports = Compiler;
