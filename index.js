const path = require('path');
const fs = require('fs');
const processPDFPage = require('./parseFromPdf');
const download = require('download');
const countryCodes = require('./lib/country-codes-list.json');
const rimraf = require('rimraf');
const { default: PQueue } = require('p-queue');
const { default: Worker } = require('jest-worker');
const USStates = require('./lib/us-states');
const { jsonArrayToCSV } = require('./utils');
const { paramCase } = require('change-case');
const _ = require('lodash');
const DATA_LAST_AVAILABLE_FOR_DATE = '2020-04-11';
const DOWNLOAD_CONCURRENCY = 20;
const PROCESS_CONCURRENCY = 30;

function makePDFUrl(date, countryCode) {
  return `https://www.gstatic.com/covid19/mobility/${date}_${countryCode}_Mobility_Report_en.pdf`;
}

const chartTypes = [
  'retailAndRecreation',
  'groceryAndPharmacy',
  'parks',
  'transitStations',
  'workplaces',
  'residential',
];

const countryCodesList = Object.keys(countryCodes);
const USStateCodeList = Object.values(USStates).map(
  (stateName) => `US_${stateName.replace(/ /g, '_')}`
);
const getUSStateCodeFromStateNameCode = (stateNameCode) => {
  const matchedState = Object.entries(USStates).find(
    ([stateCode, stateName]) => stateName === stateNameCode.replace('US_', '').replace(/_/g, ' ')
  );
  return matchedState[0];
};

const downloadQueue = new PQueue({ concurrency: DOWNLOAD_CONCURRENCY });
const processQueue = new PQueue({ concurrency: PROCESS_CONCURRENCY });
const pdfsPath = path.join(__dirname, 'pdfs', DATA_LAST_AVAILABLE_FOR_DATE);
const outputPath = path.join(__dirname, 'output');

async function downloadPdf(countryCode) {
  const pdfPath = path.join(pdfsPath, countryCode);
  const fileUrl = makePDFUrl(DATA_LAST_AVAILABLE_FOR_DATE, countryCode);
  console.log('Downloading...', fileUrl);
  await download(fileUrl, pdfPath, { filename: 'mobility.pdf' });
}

function cleanPath(pathToClean) {
  console.log('Clearing folder...', pathToClean);
  rimraf.sync(pathToClean);
}

function downloadForAll(geographies) {
  const successGeographyCodes = [];

  geographies.forEach(async (geographyCode) => {
    try {
      await downloadQueue.add(() => downloadPdf(geographyCode));
      successGeographyCodes.push(geographyCode);
    } catch (err) {
      console.log('Failed to download for ', geographyCode);
    }
  });

  return downloadQueue.onIdle().then(() => {
    console.log(
      'Total: ',
      geographies.length,
      'Download Succeeded: ',
      successGeographyCodes.length,
      'Download Failed: ',
      geographies.length - successGeographyCodes.length
    );
    return successGeographyCodes;
  });
}

function mergeMobilityJSON(jsonA, jsonB, jsonKey) {
  const combined = {};

  chartTypes.forEach((chartType) => {
    const aPoints = jsonA[jsonKey][chartType].points;
    const bPoints = jsonB[jsonKey][chartType].points;

    combined[chartType] = {
      points: _.uniqBy([...aPoints, ...bPoints], (p) => p.date).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    };
  });

  return {
    [jsonKey]: combined,
  };
}

function processForAll(geographyCodes, stateFromCountryCode) {
  const processWorker = new Worker(require.resolve('./parseFromPdf'));
  processWorker.getStderr().pipe(process.stderr);
  processWorker.getStdout().pipe(process.stdout);

  geographyCodes.forEach(async (geographyCode) => {
    const fileOutputPath = stateFromCountryCode
      ? path.join(
          __dirname,
          'output',
          stateFromCountryCode,
          getUSStateCodeFromStateNameCode(geographyCode)
        )
      : path.join(__dirname, 'output', geographyCode);

    console.log('Processing...', geographyCode);
    const pdfPath = path.join(pdfsPath, geographyCode, 'mobility.pdf');
    const page1Charts = await processQueue.add(() =>
      processWorker.processPDFPage(pdfPath, 1, fileOutputPath)
    );
    const page2Charts = await processQueue.add(() =>
      processWorker.processPDFPage(pdfPath, 2, fileOutputPath)
    );
    const charts = page1Charts.concat(page2Charts);

    if (charts.length !== 6) {
      throw new Error('Expected to receive 6 graphs, got: ', charts.length);
    }

    const jsonKey = stateFromCountryCode ? 'state' : 'country';
    if(fs.existsSync(path.join(fileOutputPath, 'mobility.json'))){
      console.log('Found mobility.json file...', geographyCode);
    } else {
      console.log('mobility.json file not found...', geographyCode);
    }
    const currentJSON = require(path.join(fileOutputPath, 'mobility.json'));
    const newJson = { [jsonKey]: {} };

    charts.forEach((chart, i) => {
      newJson[jsonKey][chartTypes[i]] = chart;
    });

    const combinedJSON = mergeMobilityJSON(currentJSON, newJson, jsonKey);

    fs.writeFileSync(
      path.join(fileOutputPath, 'mobility.json'),
      JSON.stringify(combinedJSON, null, 2),
      'utf8'
    );

    charts.forEach((chart, i) => {
      fs.writeFileSync(
        path.join(fileOutputPath, `mobility-${paramCase(chartTypes[i])}.csv`),
        jsonArrayToCSV(combinedJSON[jsonKey][chartTypes[i]].points),
        'utf8'
      );
    });
    console.log('Wrote to file...', geographyCode);
  });

  return processQueue.onIdle();
}

async function run() {
  try {
    // cleanPath(pdfsPath);
    const countryCodes = await downloadForAll(countryCodesList);
    const USStateCodes = await downloadForAll(USStateCodeList);

    // cleanPath(outputPath);
    await processForAll(countryCodes);
    await processForAll(USStateCodes, 'US');
  } catch (err) {
    console.error(err);
  }
}

run();
