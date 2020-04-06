const path = require('path');
const fs = require('fs');
const processPDFPage = require('./parseFromPdf');
const download = require('download');
const countryCodes = require('country-codes-list');
const rimraf = require('rimraf');
const { default: PQueue } = require('p-queue');
const { default: Worker } = require('jest-worker');
const USStates = require('./lib/us-states');

const DATA_LAST_AVAILABLE_FOR_DATE = '2020-03-29';
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

const countryCodesList = Object.keys(countryCodes.customList('countryCode', '[{countryCode}]'));
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
const pdfsPath = path.join(__dirname, 'pdfs');
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

  console.log(
    'Total: ',
    geographies.length,
    'Download Succeeded: ',
    successGeographyCodes.length,
    'Download Failed: ',
    geographies.length - successGeographyCodes.length
  );
  return downloadQueue.onIdle().then(() => successGeographyCodes);
}

function processForAll(geographyCodes, stateFromCountryCode) {
  const processWorker = new Worker(require.resolve('./parseFromPdf'));

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
    const json = stateFromCountryCode ? { state: {} } : { country: {} };
    charts.forEach((chart, i) => {
      json[stateFromCountryCode ? 'state' : 'country'][chartTypes[i]] = chart;
    });

    fs.writeFileSync(
      path.join(fileOutputPath, 'mobility.json'),
      JSON.stringify(json, null, 2),
      'utf8'
    );

    console.log('Wrote to file...', geographyCode);
  });

  return processQueue.onIdle();
}

async function run() {
  try {
    cleanPath(pdfsPath);
    const countryCodes = await downloadForAll(countryCodesList);
    const USStateCodes = await downloadForAll(USStateCodeList);

    cleanPath(outputPath);
    await processForAll(countryCodes);
    await processForAll(USStateCodes, 'US');
  } catch (err) {
    console.error(err);
  }
}

run();
