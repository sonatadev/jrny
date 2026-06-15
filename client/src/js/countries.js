// Elenco paesi con nomi localizzati in italiano, generato a runtime da
// Intl.DisplayNames (nessuna libreria, nessun costo). Fallback: codici grezzi.
const CODES = [
  'AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD','BB','BY',
  'BE','BZ','BJ','BT','BO','BA','BW','BR','BN','BG','BF','BI','KH','CM','CA','CV',
  'CF','TD','CL','CN','CO','KM','CG','CD','CR','CI','HR','CU','CY','CZ','DK','DJ',
  'DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FJ','FI','FR','GA','GM','GE',
  'DE','GH','GR','GD','GT','GN','GW','GY','HT','HN','HU','IS','IN','ID','IR','IQ',
  'IE','IL','IT','JM','JP','JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB',
  'LS','LR','LY','LI','LT','LU','MG','MW','MY','MV','ML','MT','MH','MR','MU','MX',
  'FM','MD','MC','MN','ME','MA','MZ','MM','NA','NR','NP','NL','NZ','NI','NE','NG',
  'MK','NO','OM','PK','PW','PA','PG','PY','PE','PH','PL','PT','QA','RO','RU','RW',
  'KN','LC','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SK','SI','SB','SO',
  'ZA','SS','ES','LK','SD','SR','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TO',
  'TT','TN','TR','TM','TV','UG','UA','AE','GB','US','UY','UZ','VU','VA','VE','VN',
  'YE','ZM','ZW','HK','MO','PR','GL','PS',
]

function buildCountries() {
  try {
    const dn = new Intl.DisplayNames(['it'], { type: 'region' })
    return CODES
      .map(c => dn.of(c))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'it'))
  } catch {
    return CODES
  }
}

export const COUNTRIES = buildCountries()
