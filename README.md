# Covid-19 Mobility Tracker

![last synced from source](https://badgen.net/badge/last%20synced%20from%20source/April%208th%203:1%20PM%20GMT/green) ![last update from google](https://badgen.net/badge/last%20update%20from%20google/April%202nd%205:21%20AM%20GMT/blue)

[Google Mobility Reports](https://www.google.com/covid19/mobility/) show aggregate activity in each country,
and how it changes in response to policies aimed at combating COVID-19. However, it is only published as a PDF
and the data isn't available in a machine-readable format that could enable more richer analysis.

**This is an effort to reverse-engineer the PDFs into vectors and ultimately into time-series data available as a JSON Rest API.**

![alt text](https://github.com/pastelsky/covid-19-mobility-tracker/raw/master/code.png)

## Usage

#### Country-level data

Country level JSON is available for use at –

```
https://pastelsky.github.io/covid-19-mobility-tracker/output/<ISO-COUNTRY-CODE>/mobility.json
```

**For eg India**: https://pastelsky.github.io/covid-19-mobility-tracker/output/IN/mobility.json

#### US State-level data

US state level JSON is available at –

```
https://pastelsky.github.io/covid-19-mobility-tracker/output/US/<US-STATE-CODE>/mobility.json
```

**For eg: New York**: https://pastelsky.github.io/covid-19-mobility-tracker/output/US/NY/mobility.json


### Accessing data as CSV

If you prefer to use CSVs instead, you can go to -

```
https://pastelsky.github.io/covid-19-mobility-tracker/output/<ISO-COUNTRY-CODE>/mobility-<social-place>.csv
```

Where social place is one of `parks` | `residential` | `retail-and-recreation` | `transit-stations` | `workplaces` | `grocery-and-pharmacy`

For eg. parks data for India in CSV - https://pastelsky.github.io/covid-19-mobility-tracker/output/IN/mobility-parks.csv

For US states, just add the state code after the country code.

#### Data structure

Each data element consists of `date` and `value` (which represents mobility change in percentage)

## Limitations

- Expected error range is ±2%, though errors in activity percentanges
  should be rare given the methodolgy used to extract data.
- As of now, this only indexes country-level data and US state level data. State / Province level breakup for other countries is yet to be added.
- Data sources will be updated once / day and is incumbent upon google publishing updated reports
- It assumes that the same scale (-80% to +80%) is used in all PDFs and they are structured similarly.

## Contributing

1. Run `yarn install` to install dependencies.
2. Install Inkscape `1.0beta2` for your OS, and make sure the `inkscape` is available
   as in your path as a command line utility.
   You can test this using `inkscape --version`

3. Run `yarn build` to begin downloading reports form google, and parsing it into the `ouput` folder.

## Credits

All data made available for use is by taken from Google Mobility Reports.
This project does not claim any ownership over this data, and is not reponsible
for guaranteeing accuracy of this data.
