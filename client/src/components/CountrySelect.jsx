import { useId } from 'react'
import { COUNTRIES } from '../js/countries'

// Campo paese: input con tendina di suggerimenti (datalist) — si può scegliere
// dall'elenco o digitare a mano (utile per regioni/destinazioni non-paese).
export default function CountrySelect({ value, onChange, placeholder = 'Es. Giappone', required }) {
  const listId = useId()
  return (
    <>
      <input
        className="form-control"
        list={listId}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {COUNTRIES.map(c => <option key={c} value={c} />)}
      </datalist>
    </>
  )
}
