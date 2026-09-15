'use strict';

const BroccoliPersistentFilter = require('broccoli-persistent-filter');

// clean-css drops the rule after an @starting-style block; Lightning CSS parses modern CSS.
class LightningCssFilter extends BroccoliPersistentFilter {
  baseDir() {
    return __dirname;
  }

  processString(contents, relativePath) {
    const { transform } = require('lightningcss');
    const { code } = transform({
      filename: relativePath,
      code: Buffer.from(contents),
      minify: true,
    });
    return code.toString();
  }
}

LightningCssFilter.prototype.extensions = ['css'];
LightningCssFilter.prototype.targetExtension = 'css';

module.exports = {
  name: require('./package').name,

  setupPreprocessorRegistry(type, registry) {
    if (type !== 'parent') return;

    const addon = this;
    registry.add('minify-css', {
      name: 'lightningcss-minify',
      ext: 'css',
      toTree(tree) {
        const options = addon._findHost().options.minifyCSS;
        if (!options || !options.enabled) return tree;
        return new LightningCssFilter(tree, { persist: false });
      },
    });
  },
};
