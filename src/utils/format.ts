export function formatDate(value:string|Date|null|undefined){if(!value)return '—';const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return '—';return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(date)}
// Pour une colonne "date" sans heure (expense_date, due_date, closure_date…) :
// new Date("2026-09-01") vaut minuit UTC, donc un fuseau derrière UTC
// l'affiche encore la veille — on fixe midi pour rester sur le même jour
// partout. SM-20 (audit externe) : ces dates s'affichaient aussi parfois
// brutes (« 2026-09-01 ») faute de passer par formatDate du tout.
export function formatLocalDate(value:string|null|undefined){if(!value)return '—';return formatDate(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00`:value)}
export function formatDateTime(value:string|Date|null|undefined){if(!value)return '—';const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return '—';return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)}
// fr-FR et fr-CA rendent le séparateur de milliers différemment : fr-FR utilise
// une espace fine insécable (U+202F), invisible dans certaines polices/rendus de
// cette pile technique ; fr-CA une espace insécable normale (U+00A0), toujours
// visible. Même règle que CurrencyProvider (formatMoney, utilisé partout
// ailleurs dans l'app) : fr-CA pour tout nombre/montant, fr-FR réservé aux dates.
export function formatNumber(value:unknown,maximumFractionDigits=0){const number=Number(value);return new Intl.NumberFormat('fr-CA',{maximumFractionDigits:Number.isInteger(number)?0:maximumFractionDigits}).format(Number.isFinite(number)?number:0)}
export function formatCurrency(value:unknown,currency='GNF'){const number=Number(value);return new Intl.NumberFormat('fr-CA',{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number.isFinite(number)?number:0)}
