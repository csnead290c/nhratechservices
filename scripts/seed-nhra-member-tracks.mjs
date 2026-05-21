/**
 * Seed NHRA Member Tracks
 * Source: nhra.com/member-track-locator, May 2026
 *
 * Usage:
 *   PARITY_URL=https://nhratechservices.com PARITY_TOKEN=<admin-token> node scripts/seed-nhra-member-tracks.mjs
 *
 * Set updateExisting=true to also update division/city/coords on existing tracks matched by name.
 */

const BASE_URL = process.env.PARITY_URL || 'https://nhratechservices.com';
const TOKEN = process.env.PARITY_TOKEN || '';
const UPDATE_EXISTING = process.env.UPDATE_EXISTING === '1';

// ── All 107 NHRA Member Tracks ──────────────────────────────────────────────
// Coordinates sourced from airdensityonline.com track pages where available,
// city-center approximations otherwise.
const NHRA_TRACKS = [
  // ── Division 1 ────────────────────────────────────────────────────────────
  { trackName: 'Bonfield Event Park',            nhraDivision: '1', city: 'Bonfield',                 state: 'ON',  timezoneIana: 'America/Toronto',        latitude: 46.1700, longitude: -79.7400 },
  { trackName: 'Cape Breton Dragway',            nhraDivision: '1', city: 'Gardiner Mines',           state: 'NS',  timezoneIana: 'America/Halifax',         latitude: 46.0500, longitude: -59.9200 },
  { trackName: 'Cecil County Dragway',           nhraDivision: '1', city: 'Rising Sun',               state: 'MD',  timezoneIana: 'America/New_York',        latitude: 39.6394, longitude: -75.9915 },
  { trackName: 'EPCAL Motorsports Park',         nhraDivision: '1', city: 'Calverton',                state: 'NY',  timezoneIana: 'America/New_York',        latitude: 40.9237, longitude: -72.7651 },
  { trackName: 'ESTA Safety Park',               nhraDivision: '1', city: 'Cicero',                   state: 'NY',  timezoneIana: 'America/New_York',        latitude: 43.1770, longitude: -76.0670 },
  { trackName: 'Greenfield Dragway',             nhraDivision: '1', city: 'Greenville',               state: 'NS',  timezoneIana: 'America/Halifax',         latitude: 44.9800, longitude: -64.6200 },
  { trackName: 'Island Dragway',                 nhraDivision: '1', city: 'Great Meadows',            state: 'NJ',  timezoneIana: 'America/New_York',        latitude: 40.8800, longitude: -74.9171 },
  { trackName: 'Lebanon Valley Dragway',         nhraDivision: '1', city: 'West Lebanon',             state: 'NY',  timezoneIana: 'America/New_York',        latitude: 42.4380, longitude: -73.5340 },
  { trackName: 'Luskville Dragway',              nhraDivision: '1', city: 'Luskville',                state: 'QC',  timezoneIana: 'America/Toronto',         latitude: 45.5300, longitude: -76.0200 },
  { trackName: 'Maryland International Raceway', nhraDivision: '1', city: 'Mechanicsville',           state: 'MD',  timezoneIana: 'America/New_York',        latitude: 38.3949, longitude: -76.8458 },
  { trackName: 'Mason-Dixon Dragway',            nhraDivision: '1', city: 'Boonsboro',                state: 'MD',  timezoneIana: 'America/New_York',        latitude: 39.5660, longitude: -77.6417 },
  { trackName: 'Miramichi Dragway Park',         nhraDivision: '1', city: 'Miramichi',                state: 'NB',  timezoneIana: 'America/Moncton',         latitude: 47.0200, longitude: -65.5000 },
  { trackName: 'Napierville Dragway',            nhraDivision: '1', city: 'St Cyprien de Napierville', state: 'QC', timezoneIana: 'America/Toronto',         latitude: 45.1900, longitude: -73.4200 },
  { trackName: 'New England Dragway',            nhraDivision: '1', city: 'Epping',                   state: 'NH',  timezoneIana: 'America/New_York',        latitude: 43.0210, longitude: -71.0277 },
  { trackName: 'Numidia Dragway',                nhraDivision: '1', city: 'Numidia',                  state: 'PA',  timezoneIana: 'America/New_York',        latitude: 40.8888, longitude: -76.3999 },
  { trackName: 'South Mountain Raceway',         nhraDivision: '1', city: 'Boiling Springs',          state: 'PA',  timezoneIana: 'America/New_York',        latitude: 40.0660, longitude: -77.1660 },
  { trackName: 'Toronto Motorsports Park',       nhraDivision: '1', city: 'Cayuga',                   state: 'ON',  timezoneIana: 'America/Toronto',         latitude: 42.9540, longitude: -79.8610 },

  // ── Division 2 ────────────────────────────────────────────────────────────
  { trackName: 'Bradenton Motorsports Park',     nhraDivision: '2', city: 'Bradenton',                state: 'FL',  timezoneIana: 'America/New_York',        latitude: 27.4741, longitude: -82.3267 },
  { trackName: 'Bristol Dragway',                nhraDivision: '2', city: 'Bristol',                  state: 'TN',  timezoneIana: 'America/New_York',        latitude: 36.5156, longitude: -82.2567 },
  { trackName: 'Carolina Dragway',               nhraDivision: '2', city: 'Aiken',                    state: 'SC',  timezoneIana: 'America/New_York',        latitude: 33.5614, longitude: -81.7229 },
  { trackName: 'Darlington Dragway',             nhraDivision: '2', city: 'Hartsville',               state: 'SC',  timezoneIana: 'America/New_York',        latitude: 34.3760, longitude: -80.0730 },
  { trackName: 'Gainesville Raceway',            nhraDivision: '2', city: 'Gainesville',              state: 'FL',  timezoneIana: 'America/New_York',        latitude: 29.7585, longitude: -82.2745 },
  { trackName: 'Lead Foot City',                 nhraDivision: '2', city: 'Brooksville',              state: 'FL',  timezoneIana: 'America/New_York',        latitude: 28.5550, longitude: -82.3980 },
  { trackName: 'Middle Georgia Sports Park',     nhraDivision: '2', city: 'Jeffersonville',           state: 'GA',  timezoneIana: 'America/New_York',        latitude: 32.6900, longitude: -83.3400 },
  { trackName: 'Orlando Speed World Dragway',    nhraDivision: '2', city: 'Orlando',                  state: 'FL',  timezoneIana: 'America/New_York',        latitude: 28.4950, longitude: -81.1730 },
  { trackName: 'Puerto Rico International Speedway', nhraDivision: '2', city: 'Salinas',             state: 'PR',  timezoneIana: 'America/Puerto_Rico',     latitude: 17.9700, longitude: -66.2970 },
  { trackName: 'Rockingham Dragway',             nhraDivision: '2', city: 'Rockingham',               state: 'NC',  timezoneIana: 'America/New_York',        latitude: 35.0130, longitude: -79.7950 },
  { trackName: 'Silver Dollar Motorsports Park', nhraDivision: '2', city: 'Reynolds',                 state: 'GA',  timezoneIana: 'America/New_York',        latitude: 32.5500, longitude: -84.0900 },
  { trackName: 'South Georgia Motorsports Park', nhraDivision: '2', city: 'Adel',                     state: 'GA',  timezoneIana: 'America/New_York',        latitude: 31.1377, longitude: -83.4247 },
  { trackName: 'zMax Dragway',                   nhraDivision: '2', city: 'Concord',                  state: 'NC',  timezoneIana: 'America/New_York',        latitude: 35.3521, longitude: -80.6833 },

  // ── Division 3 ────────────────────────────────────────────────────────────
  { trackName: 'Beech Bend Raceway Park',        nhraDivision: '3', city: 'Bowling Green',            state: 'KY',  timezoneIana: 'America/Chicago',         latitude: 36.9460, longitude: -86.5050 },
  { trackName: 'Byron Dragway',                  nhraDivision: '3', city: 'Byron',                    state: 'IL',  timezoneIana: 'America/Chicago',         latitude: 42.1250, longitude: -89.2520 },
  { trackName: 'Coles County Dragway U.S.A. LLC',nhraDivision: '3', city: 'Charleston',               state: 'IL',  timezoneIana: 'America/Chicago',         latitude: 39.4960, longitude: -88.1760 },
  { trackName: 'Fitzgerald Motorsports Park',    nhraDivision: '3', city: 'Crossville',               state: 'TN',  timezoneIana: 'America/Chicago',         latitude: 35.9490, longitude: -85.0270 },
  { trackName: 'Keystone Raceway Park',          nhraDivision: '3', city: 'New Alexandria',           state: 'PA',  timezoneIana: 'America/New_York',        latitude: 40.3680, longitude: -79.4380 },
  { trackName: 'Kuhnle Motorsports Park',        nhraDivision: '3', city: 'Thompson',                 state: 'OH',  timezoneIana: 'America/New_York',        latitude: 41.6930, longitude: -80.9790 },
  { trackName: 'Lucas Oil Indianapolis Raceway Park', nhraDivision: '3', city: 'Indianapolis',        state: 'IN',  timezoneIana: 'America/Indiana/Indianapolis', latitude: 39.7106, longitude: -86.3419 },
  { trackName: 'Ohio Valley Dragway',            nhraDivision: '3', city: 'West Point',               state: 'KY',  timezoneIana: 'America/New_York',        latitude: 37.9900, longitude: -85.9600 },
  { trackName: 'Route 66 Raceway',               nhraDivision: '3', city: 'Joliet',                   state: 'IL',  timezoneIana: 'America/Chicago',         latitude: 41.4759, longitude: -88.0515 },
  { trackName: 'Summit Racing Equipment Motorsports Park', nhraDivision: '3', city: 'Norwalk',        state: 'OH',  timezoneIana: 'America/New_York',        latitude: 41.2423, longitude: -82.6157 },
  { trackName: 'US 131 Motorsports Park',        nhraDivision: '3', city: 'Martin',                   state: 'MI',  timezoneIana: 'America/Detroit',         latitude: 42.5290, longitude: -85.6400 },
  { trackName: 'Wabash Valley Dragway',          nhraDivision: '3', city: 'Terre Haute',              state: 'IN',  timezoneIana: 'America/Indiana/Indianapolis', latitude: 39.4800, longitude: -87.4000 },
  { trackName: 'Wagler Motorsports Park',        nhraDivision: '3', city: 'Lyons',                    state: 'IN',  timezoneIana: 'America/Indiana/Indianapolis', latitude: 38.9900, longitude: -87.0800 },
  { trackName: 'World Wide Technology Raceway',  nhraDivision: '3', city: 'Madison',                  state: 'IL',  timezoneIana: 'America/Chicago',         latitude: 38.6850, longitude: -90.1530 },

  // ── Division 4 ────────────────────────────────────────────────────────────
  { trackName: 'Amarillo Dragway',               nhraDivision: '4', city: 'Amarillo',                 state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 35.2220, longitude: -101.8313 },
  { trackName: 'Ardmore Dragway',                nhraDivision: '4', city: 'Ardmore',                  state: 'OK',  timezoneIana: 'America/Chicago',         latitude: 34.1743, longitude: -97.1436 },
  { trackName: 'Concho Valley Dragway',          nhraDivision: '4', city: 'San Angelo',               state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 31.4638, longitude: -100.4370 },
  { trackName: 'Holly Springs Motorsports',      nhraDivision: '4', city: 'Holly Springs',            state: 'MS',  timezoneIana: 'America/Chicago',         latitude: 34.7690, longitude: -89.4480 },
  { trackName: 'Houston Motorsports Park',       nhraDivision: '4', city: 'Houston',                  state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 29.6850, longitude: -95.4780 },
  { trackName: 'No Problem Raceway Park',        nhraDivision: '4', city: 'Belle Rose',               state: 'LA',  timezoneIana: 'America/Chicago',         latitude: 29.8860, longitude: -91.0520 },
  { trackName: 'Osage Casino Hotel Tulsa Raceway Park', nhraDivision: '4', city: 'Tulsa',             state: 'OK',  timezoneIana: 'America/Chicago',         latitude: 36.3050, longitude: -95.9320 },
  { trackName: 'Paris Drag Strip',               nhraDivision: '4', city: 'Paris',                    state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 33.6609, longitude: -95.5555 },
  { trackName: 'Pine Valley Raceway',            nhraDivision: '4', city: 'Lufkin',                   state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 31.3380, longitude: -94.7290 },
  { trackName: 'Prescott Raceway',               nhraDivision: '4', city: 'Prescott',                 state: 'AR',  timezoneIana: 'America/Chicago',         latitude: 33.8020, longitude: -93.3820 },
  { trackName: 'Roswell Dragway',                nhraDivision: '4', city: 'Roswell',                  state: 'NM',  timezoneIana: 'America/Denver',          latitude: 33.3943, longitude: -104.5230 },
  { trackName: 'Texas Motorplex',                nhraDivision: '4', city: 'Ennis',                    state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 32.3040, longitude: -96.6800 },
  { trackName: 'Thunder Valley Raceway Park',    nhraDivision: '4', city: 'Lexington',                state: 'OK',  timezoneIana: 'America/Chicago',         latitude: 35.0200, longitude: -97.3300 },
  { trackName: 'Wichita Raceway Park',           nhraDivision: '4', city: 'Iowa Park',                state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 33.9570, longitude: -98.6830 },
  { trackName: 'Xtreme Raceway Park',            nhraDivision: '4', city: 'Ferris',                   state: 'TX',  timezoneIana: 'America/Chicago',         latitude: 32.5300, longitude: -96.6600 },

  // ── Division 5 ────────────────────────────────────────────────────────────
  { trackName: 'Bandimere Speedway',             nhraDivision: '5', city: 'Morrison',                 state: 'CO',  timezoneIana: 'America/Denver',          latitude: 39.6547, longitude: -105.1989 },
  { trackName: 'Brainerd International Raceway', nhraDivision: '5', city: 'Brainerd',                 state: 'MN',  timezoneIana: 'America/Chicago',         latitude: 46.3880, longitude: -94.1900 },
  { trackName: 'Cedar Falls Motorsports Park',   nhraDivision: '5', city: 'Cedar Falls',              state: 'IA',  timezoneIana: 'America/Chicago',         latitude: 42.5350, longitude: -92.4450 },
  { trackName: 'Flying H Dragstrip',             nhraDivision: '5', city: 'Odessa',                   state: 'MO',  timezoneIana: 'America/Chicago',         latitude: 38.9960, longitude: -93.9410 },
  { trackName: 'Grove Creek Raceway',            nhraDivision: '5', city: 'Grove City',               state: 'MN',  timezoneIana: 'America/Chicago',         latitude: 45.1570, longitude: -94.6820 },
  { trackName: 'Interstate Raceway',             nhraDivision: '5', city: 'Glyndon',                  state: 'ND',  timezoneIana: 'America/Chicago',         latitude: 46.8740, longitude: -96.5820 },
  { trackName: 'Julesburg Dragstrip',            nhraDivision: '5', city: 'Julesburg',                state: 'CO',  timezoneIana: 'America/Denver',          latitude: 40.9890, longitude: -102.2710 },
  { trackName: 'Kansas International Dragway',   nhraDivision: '5', city: 'Maize',                    state: 'KS',  timezoneIana: 'America/Chicago',         latitude: 37.7760, longitude: -97.4660 },
  { trackName: 'Kearney Raceway Park',           nhraDivision: '5', city: 'Kearney',                  state: 'NE',  timezoneIana: 'America/Chicago',         latitude: 40.6990, longitude: -99.0810 },
  { trackName: 'Onawa Dragway',                  nhraDivision: '5', city: 'Onawa',                    state: 'IA',  timezoneIana: 'America/Chicago',         latitude: 42.0280, longitude: -96.0990 },
  { trackName: 'Pueblo Motorsports Park',        nhraDivision: '5', city: 'Colorado Springs',         state: 'CO',  timezoneIana: 'America/Denver',          latitude: 38.2700, longitude: -104.6100 },
  { trackName: 'Rock Falls Raceway',             nhraDivision: '5', city: 'Eau Claire',               state: 'WI',  timezoneIana: 'America/Chicago',         latitude: 44.7640, longitude: -91.4980 },
  { trackName: 'SRCA Dragstrip',                 nhraDivision: '5', city: 'Great Bend',               state: 'KS',  timezoneIana: 'America/Chicago',         latitude: 38.3650, longitude: -98.7650 },
  { trackName: 'Sturgis Dragway',                nhraDivision: '5', city: 'Sturgis',                  state: 'SD',  timezoneIana: 'America/Denver',          latitude: 44.4100, longitude: -103.5090 },
  { trackName: 'Thunder Valley Dragways',        nhraDivision: '5', city: 'Parker',                   state: 'SD',  timezoneIana: 'America/Chicago',         latitude: 43.3980, longitude: -97.1310 },
  { trackName: 'Tri-State Raceway',              nhraDivision: '5', city: 'Earlville',                state: 'IA',  timezoneIana: 'America/Chicago',         latitude: 42.4850, longitude: -91.7780 },

  // ── Division 6 ────────────────────────────────────────────────────────────
  { trackName: 'Alaska Raceway Park',            nhraDivision: '6', city: 'Palmer',                   state: 'AK',  timezoneIana: 'America/Anchorage',       latitude: 61.5990, longitude: -149.1010 },
  { trackName: 'Bremerton Raceway',              nhraDivision: '6', city: 'Bremerton',                state: 'WA',  timezoneIana: 'America/Los_Angeles',     latitude: 47.5660, longitude: -122.7460 },
  { trackName: 'Coos Bay Speedway',              nhraDivision: '6', city: 'Coos Bay',                 state: 'OR',  timezoneIana: 'America/Los_Angeles',     latitude: 43.3665, longitude: -124.2179 },
  { trackName: 'Firebird Raceway',               nhraDivision: '6', city: 'Eagle',                    state: 'ID',  timezoneIana: 'America/Boise',           latitude: 43.7370, longitude: -116.4460 },
  { trackName: 'Lewistown Raceway',              nhraDivision: '6', city: 'Lewistown',                state: 'MT',  timezoneIana: 'America/Denver',          latitude: 47.0630, longitude: -109.4280 },
  { trackName: 'Lost Creek Raceway',             nhraDivision: '6', city: 'Anaconda',                 state: 'MT',  timezoneIana: 'America/Denver',          latitude: 46.1280, longitude: -112.9430 },
  { trackName: 'M.H.D.R.A. Dragstrip',          nhraDivision: '6', city: 'Medicine Hat',             state: 'AB',  timezoneIana: 'America/Edmonton',        latitude: 50.0420, longitude: -110.6770 },
  { trackName: 'Madras Dragstrip',               nhraDivision: '6', city: 'Madras',                   state: 'OR',  timezoneIana: 'America/Los_Angeles',     latitude: 44.6330, longitude: -121.1290 },
  { trackName: 'Medford Dragstrip',              nhraDivision: '6', city: 'Central Point',            state: 'OR',  timezoneIana: 'America/Los_Angeles',     latitude: 42.3760, longitude: -122.9170 },
  { trackName: 'Mission Raceway Park',           nhraDivision: '6', city: 'Mission',                  state: 'BC',  timezoneIana: 'America/Vancouver',       latitude: 49.1330, longitude: -122.3030 },
  { trackName: 'NITRO Motorsports Park',         nhraDivision: '6', city: 'Prince George',            state: 'BC',  timezoneIana: 'America/Vancouver',       latitude: 53.9170, longitude: -122.7490 },
  { trackName: 'Pacific Raceways',               nhraDivision: '6', city: 'Kent',                     state: 'WA',  timezoneIana: 'America/Los_Angeles',     latitude: 47.3667, longitude: -122.1333 },
  { trackName: 'Portland International Raceway', nhraDivision: '6', city: 'Portland',                 state: 'OR',  timezoneIana: 'America/Los_Angeles',     latitude: 45.5970, longitude: -122.6870 },
  { trackName: "Qlipse' Raceway Park",           nhraDivision: '6', city: 'Airway Heights',           state: 'WA',  timezoneIana: 'America/Los_Angeles',     latitude: 47.6450, longitude: -117.5920 },
  { trackName: 'RAD Torque Raceway',             nhraDivision: '6', city: 'Nisku',                    state: 'AB',  timezoneIana: 'America/Edmonton',        latitude: 53.3830, longitude: -113.5000 },
  { trackName: 'Renegade Raceway',               nhraDivision: '6', city: 'Wapato',                   state: 'WA',  timezoneIana: 'America/Los_Angeles',     latitude: 46.4520, longitude: -120.4210 },
  { trackName: 'Walla Walla Drag Strip',         nhraDivision: '6', city: 'Walla Walla',              state: 'WA',  timezoneIana: 'America/Los_Angeles',     latitude: 46.0650, longitude: -118.3430 },
  { trackName: 'Woodburn Dragstrip',             nhraDivision: '6', city: 'Woodburn',                 state: 'OR',  timezoneIana: 'America/Los_Angeles',     latitude: 45.1550, longitude: -122.8500 },
  { trackName: 'Yellowstone Drag Strip',         nhraDivision: '6', city: 'Acton',                    state: 'MT',  timezoneIana: 'America/Denver',          latitude: 45.8940, longitude: -108.2360 },

  // ── Division 7 ────────────────────────────────────────────────────────────
  { trackName: 'Albuquerque Dragway',            nhraDivision: '7', city: 'Albuquerque',              state: 'NM',  timezoneIana: 'America/Denver',          latitude: 35.0690, longitude: -106.6500 },
  { trackName: 'Barona 1/8-Mile Drag Strip',     nhraDivision: '7', city: 'Lakeside',                 state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 32.8770, longitude: -116.8970 },
  { trackName: 'Famoso Dragstrip',               nhraDivision: '7', city: 'McFarland',                state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 35.6810, longitude: -119.2290 },
  { trackName: 'Firebird Motorsports Park',      nhraDivision: '7', city: 'Chandler',                 state: 'AZ',  timezoneIana: 'America/Phoenix',         latitude: 33.1800, longitude: -111.9200 },
  { trackName: 'In-N-Out Burger Pomona Dragstrip', nhraDivision: '7', city: 'Pomona',                 state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 34.0589, longitude: -117.7517 },
  { trackName: 'Kauai Raceway Park',             nhraDivision: '7', city: 'Kekaha',                   state: 'HI',  timezoneIana: 'Pacific/Honolulu',        latitude: 21.9820, longitude: -159.7150 },
  { trackName: 'Maui Raceway Park',              nhraDivision: '7', city: 'Kahului',                  state: 'HI',  timezoneIana: 'Pacific/Honolulu',        latitude: 20.8893, longitude: -156.4729 },
  { trackName: 'Redding Motorsports Park',       nhraDivision: '7', city: 'Redding',                  state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 40.5860, longitude: -122.3920 },
  { trackName: 'Samoa Dragstrip',                nhraDivision: '7', city: 'Samoa',                    state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 40.8180, longitude: -124.1840 },
  { trackName: 'Sonoma Raceway',                 nhraDivision: '7', city: 'Sonoma',                   state: 'CA',  timezoneIana: 'America/Los_Angeles',     latitude: 38.1611, longitude: -122.4550 },
  { trackName: 'The Strip at Las Vegas Motor Speedway', nhraDivision: '7', city: 'Las Vegas',         state: 'NV',  timezoneIana: 'America/Los_Angeles',     latitude: 36.2719, longitude: -115.0103 },
  { trackName: 'TopGun Dragstrip',               nhraDivision: '7', city: 'Fallon',                   state: 'NV',  timezoneIana: 'America/Los_Angeles',     latitude: 39.4740, longitude: -118.7770 },
  { trackName: 'Tucson Dragway',                 nhraDivision: '7', city: 'Tucson',                   state: 'AZ',  timezoneIana: 'America/Phoenix',         latitude: 32.2220, longitude: -110.9260 },
  { trackName: 'Western Colorado Dragway',       nhraDivision: '7', city: 'Grand Junction',           state: 'CO',  timezoneIana: 'America/Denver',          latitude: 39.0640, longitude: -108.5510 },

  // ── World ─────────────────────────────────────────────────────────────────
  { trackName: 'Bahrain International Circuit',  nhraDivision: 'W', city: 'Umm Jidar',               state: 'BH',  timezoneIana: 'Asia/Bahrain',            latitude: 26.0325, longitude: 50.5106 },
];

async function main() {
  if (!TOKEN) {
    console.error('ERROR: PARITY_TOKEN env var is required');
    console.error('Usage: PARITY_URL=https://nhratechservices.com PARITY_TOKEN=<token> node scripts/seed-nhra-member-tracks.mjs');
    process.exit(1);
  }

  console.log(`Seeding ${NHRA_TRACKS.length} NHRA member tracks to ${BASE_URL}`);
  console.log(`updateExisting: ${UPDATE_EXISTING}`);

  const res = await fetch(`${BASE_URL}/api/parity.php?action=bulkCreateTracks`, {  // /api prefix matches app API_BASE
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ tracks: NHRA_TRACKS, updateExisting: UPDATE_EXISTING }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('API error:', data);
    process.exit(1);
  }

  console.log(`\nResult:`);
  console.log(`  Created: ${data.created}`);
  console.log(`  Updated: ${data.updated}`);
  console.log(`  Skipped: ${data.skipped}`);

  const errors = data.results.filter(r => r.status === 'error');
  if (errors.length > 0) {
    console.warn(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.warn(`  [${e.index}] ${e.trackName}: ${e.error}`));
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
