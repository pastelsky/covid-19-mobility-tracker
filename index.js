const path = require('path');
const fs = require('fs');
const processPDFPage = require('./parseFromPdf');
const download = require('download');
const countryCodes = require('country-codes-list');
const rimraf = require('rimraf');
const { default: PQueue } = require('p-queue');
const Worker = require('jest-worker');

const DATA_LAST_AVAILABLE_FOR_DATE = '2020-03-29';
const DOWNLOAD_CONCURRENCY = 20;

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

function downloadForAllCountries() {
  const successCountryCodes = [];
  cleanPath(pdfsPath);

  countryCodesList.forEach(async (countryCode) => {
    try {
      await downloadQueue.add(() => downloadPdf(countryCode));
      successCountryCodes.push(countryCode);
    } catch (err) {
      console.log('Failed to download for ', countryCode);
    }
  });
  console.log(
    'Total: ',
    countryCodesList.length,
    'Download Succeeded: ',
    successCountryCodes.length,
    'Download Failed: ',
    countryCodesList.length - successCountryCodes.length
  );
  return downloadQueue.onIdle().then(() => successCountryCodes);
}

function processForAllCountries(countryCodes) {
  const processWorker = new Worker(require.resolve('./parseFromPdf'));

  cleanPath(outputPath);

  countryCodes.forEach(async (countryCode) => {
    const fileOutputPath = path.join(__dirname, 'output', countryCode);

    console.log('Processing...', countryCode);
    const pdfPath = path.join(pdfsPath, countryCode, 'mobility.pdf');
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
    const json = { country: {} };
    charts.forEach((chart, i) => {
      json.country[chartTypes[i]] = chart;
    });

    fs.writeFileSync(
      path.join(fileOutputPath, 'mobility.json'),
      JSON.stringify(json, null, 2),
      'utf8'
    );

    console.log('Wrote to file...', countryCode);
  });

  return processQueue.onIdle();
}

async function run() {
  try {
    const countryCodes = await downloadForAllCountries();
    await processForAllCountries(countryCodes);
  } catch (err) {
    console.error(err);
  }
}

run();
