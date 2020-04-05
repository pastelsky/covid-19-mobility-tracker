const shell = require('shelljs');
const jsdom = require('jsdom');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const { compressSVG, scale } = require('./utils');

const X_DATE_MIN = new Date(2020, 1, 16);
const X_DATE_MAX = new Date(2020, 2, 29);

const Y_PERCENT_MAX = 80;

async function pdfToSVG(pdfFile, pageNumber, exportPath) {
  console.log(
    `inkscape --without-gui --pdf-poppler --export-type=svg --export-plain-svg  --export-area-page --export-file=${exportPath} --pdf-page ${pageNumber} --vacuum-defs ${pdfFile} `
  );
  shell.exec(
    `inkscape --without-gui --pdf-poppler --export-type=svg --export-plain-svg  --export-area-page --export-file=${exportPath} --pdf-page ${pageNumber} --vacuum-defs ${pdfFile}`
  );
  const svg = fs.readFileSync(exportPath, 'utf8');
  fs.writeFileSync(exportPath, svg, 'utf8');
  return svg;
}

async function getPageCanvas(content) {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.sendTo(console);

  const browser = await puppeteer.launch();

  const page = await browser.newPage();
  await page.setContent(content);
  await page.addScriptTag({ path: './lib/flatten.js' });

  page.on('console', (msg) => {
    for (let i = 0; i < msg._args.length; ++i) console.log(`${i}: ${msg._args[i]}`);
  });

  return { page, browser };
}

async function stripSVG(page) {
  return page.evaluate(() => {
    const RESOLUTION = 1000;
    const svg = document.querySelector('svg');
    const blacklistedSelectors = [
      'symbol',
      'text',
      'tspan',
      'path:not([d])',
      'g:empty',
      'metadata',
      'mask',
      'filter',
    ];
    const removeElement = (element) => element.parentNode.removeChild(element);
    const gridlineStroke = 'rgb(218, 220, 224)';
    const seriesStroke = 'rgb(66, 133, 244)';
    const seriesPaths = [];
    const gridPaths = [];

    const mapPoints = (path) => {
      const pathLength = path.getTotalLength();
      const points = [];

      for (let i = 0; i <= pathLength; i = i + pathLength / RESOLUTION) {
        const point = path.getPointAtLength(i);
        points.push({
          x: point.x,
          y: point.y,
        });
      }

      points.push({
        x: path.getPointAtLength(pathLength).x,
        y: path.getPointAtLength(pathLength).y,
      });

      return points;
    };

    flattenSVG(svg);

    blacklistedSelectors.forEach((selector) => {
      [...document.querySelectorAll(selector)].forEach((ele) => removeElement(ele));
    });

    document.querySelectorAll('path').forEach((path) => {
      const stroke = path.style.stroke;
      const isGridStroke = stroke === gridlineStroke;
      const isSeriesStroke = stroke === seriesStroke;
      const isLongStroke = path.getTotalLength() > 6;

      if (isSeriesStroke) {
        seriesPaths.push(path);
      } else if (isGridStroke && isLongStroke) {
        gridPaths.push(path);
      } else {
        removeElement(path);
      }
    });

    document.querySelectorAll('g').forEach((g) => {
      if (!g.innerHTML.trim()) {
        removeElement(g);
      }
    });

    let charts = [];

    // add series
    seriesPaths.forEach((path) => {
      charts.push({ seriesPath: path });
    });

    if (gridPaths.length !== seriesPaths.length * 5) {
      throw new Error(
        'Each series path mush have 5 grid paths, found: gridpaths - ' +
          gridPaths.length +
          ' and series path ' +
          seriesPaths.length
      );
    }

    // add grids
    let chartIndex = 0;
    for (let i = 0; i < gridPaths.length; i += 5) {
      charts[chartIndex++].gridPaths = gridPaths.slice(i, i + 5);
    }

    // add boundaries
    charts = charts.map((chart) => ({
      // ...chart,
      x: chart.gridPaths[0].getBBox().x,
      y: chart.gridPaths[4].getBBox().y,
      width: chart.gridPaths[0].getBBox().width,
      height: chart.gridPaths[0].getBBox().y - chart.gridPaths[4].getBBox().y,
      seriesPoints: mapPoints(chart.seriesPath),
    }));

    return {
      svg: document.querySelector('svg').outerHTML,
      charts: charts,
    };
  });
}

async function processPDFPage(pdfPath, pageNumber, outputPath) {
  const svg = await pdfToSVG(
    pdfPath,
    pageNumber,
    path.join(outputPath, `original-${pageNumber}.svg`)
  );

  const { page, browser } = await getPageCanvas(svg);
  const { svg: strippedSVG, charts } = await stripSVG(page);
  await browser.close();

  const chartsProcessed = charts.map((chart) => {
    const points = chart.seriesPoints.map((point) => ({
      value:
        Y_PERCENT_MAX -
        scale(point.y, chart.y, chart.y + chart.height, 0, Y_PERCENT_MAX + Y_PERCENT_MAX),
      timestamp: new Date(
        scale(point.x, chart.x, chart.x + chart.width, X_DATE_MIN.getTime(), X_DATE_MAX.getTime())
      ),
    }));

    // downsample to be daily
    let doneDates = [];
    let downsampledPoints = [];

    const pad = (number) => (number <= 9 ? `0${number}` : number);
    const formatDate = (date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    for (let i = points.length - 1; i >= 0; i--) {
      const date = formatDate(new Date(points[i].timestamp));
      if (doneDates.includes(date)) {
        continue;
      }
      doneDates.push(date);
      downsampledPoints.push({ date, value: points[i].value });
    }

    return { points: downsampledPoints };
  });

  const svgoed = await compressSVG(strippedSVG);
  fs.writeFileSync(path.join(outputPath, `processed-${pageNumber}.svg`), svgoed, 'utf8');

  return chartsProcessed;
}

module.exports = processPDFPage;
