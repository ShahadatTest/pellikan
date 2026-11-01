// The public-domain translations beside the WEB. All come from ebible.org as USFM zips with the same layout as the
// WEB, so they share one parser. `ebible` is ebible.org's translation id, which is also the suffix of every file inside
// the zip (e.g. 43-JHNengbsb.usfm).
//
// `bundled: true`  built into bible.db and shipped inside the installer, so the app works offline on first launch.
// `bundled: false` NOT in bible.db. The app downloads the zip from ebible.org on demand into the app data folder.
//                  Adding an entry here (or to the app's catalog) needs no new release of the data build.
//
// Verify each license against ebible.org's copyright page for the translation before distributing a build.

export const TRANSLATIONS = [
  {
    id: 'BSB',
    bundled: true,
    ebible: 'engbsb',
    name: 'Berean Standard Bible',
    attribution:
      'The Holy Bible, Berean Standard Bible (BSB), contributor BSB Publishing, LLC. Dedicated to the public domain. Text from ebible.org.',
    license_url: 'https://berean.bible/terms.htm',
  },
  {
    id: 'KJV',
    bundled: true,
    ebible: 'eng-kjv2006',
    name: 'King James Version (1769 text, with Strong’s numbers)',
    attribution:
      'The King James (Authorized) Version, standardized text of 1769. Public domain outside the United Kingdom. In the UK, the Crown holds letters patent: printing or importing printed copies there needs permission from the Queen’s Printer (Cambridge University Press, Oxford University Press, Collins). Text from ebible.org.',
    license_url: 'https://en.wikipedia.org/wiki/King_James_Version#Copyright_status',
  },
  {
    id: 'ASV',
    bundled: false,
    ebible: 'eng-asv',
    name: 'American Standard Version (1901)',
    attribution: 'The American Standard Version of the Holy Bible (1901) is in the public domain. Text from ebible.org.',
    license_url: 'https://ebible.org/eng-asv/copyright.htm',
  },
  {
    id: 'YLT',
    bundled: false,
    ebible: 'engylt',
    name: 'Young’s Literal Translation (1898)',
    attribution: 'Young’s Literal Translation of the Holy Bible, by Robert Young (1898). Public domain. Text from ebible.org.',
    license_url: 'https://ebible.org/engylt/copyright.htm',
  },
  {
    id: 'DARBY',
    bundled: false,
    ebible: 'engDBY',
    name: 'Darby Translation (1884)',
    attribution: 'The Holy Scriptures, a New Translation from the Original Languages, by J. N. Darby. Public domain. Text from ebible.org.',
    license_url: 'https://ebible.org/engDBY/copyright.htm',
  },
]
