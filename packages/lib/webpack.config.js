var config = {};

function generateConfig(name) {
  var compress = name.indexOf("min") > -1;
  var config = {
    entry: "./index.js",
    output: {
      path: __dirname + "/dist/",
      filename: name + ".js",
      sourceMapFilename: name + ".map",
      library: "faxios",
      libraryTarget: "umd",
      globalObject: "this",
    },
    node: false,
    devtool: "source-map",
    mode: compress ? "production" : "development",
  };
  return config;
}

[ "faxios", "faxios.min" ].forEach(function (key) {
  config[key] = generateConfig(key);
});

module.exports = config;
