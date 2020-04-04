const SVGO = require('svgo');

const scale = (num, inMin, inMax, outMin, outMax) => {
  return Math.round(((num - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
};

const svgo = new SVGO({
  plugins: [
    { cleanupAttrs: true },
    { inlineStyles: false },
    { removeDoctype: false },
    { removeXMLProcInst: false },
    { removeComments: false },
    { removeMetadata: false },
    { removeTitle: false },
    { removeDesc: false },
    { removeUselessDefs: false },
    { removeXMLNS: false },
    { removeEditorsNSData: false },
    { removeEmptyAttrs: false },
    { removeHiddenElems: false },
    { removeEmptyText: false },
    { removeEmptyContainers: false },
    { removeViewBox: false },
    { cleanupEnableBackground: false },
    { minifyStyles: false },
    { convertStyleToAttrs: false },
    { convertColors: false },
    { convertPathData: false },
    { convertTransform: true },
    { removeUnknownsAndDefaults: true },
    { removeNonInheritableGroupAttrs: true },
    { removeUselessStrokeAndFill: true },
    { removeUnusedNS: true },
    { prefixIds: false },
    { cleanupIDs: false },
    { cleanupNumericValues: true },
    { cleanupListOfValues: true },
    { moveElemsAttrsToGroup: false },
    { moveGroupAttrsToElems: true },
    { collapseGroups: true },
    { removeRasterImages: true },
    { mergePaths: true },
    { convertShapeToPath: false },
    { convertEllipseToCircle: false },
    { sortAttrs: true },
    { sortDefsChildren: true },
    { removeDimensions: false },
    { removeAttrs: false },
    { removeAttributesBySelector: false },
    { removeElementsByAttr: false },
    { addClassesToSVGElement: false },
    { addAttributesToSVGElement: false },
    { removeOffCanvasPaths: true },
    { removeStyleElement: true },
    { removeScriptElement: true },
    { reusePaths: false },
  ],
  js2svg: {
    pretty: true,
  },
});

const compressSVG = async (svg) => {
  return (await svgo.optimize(svg)).data;
};

module.exports = {
  scale,
  compressSVG,
};
