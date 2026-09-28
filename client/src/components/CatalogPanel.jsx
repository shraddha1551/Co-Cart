/** Search + category chips + "Adding as" toggle + Add buttons (FR-UI-04, WIREFRAME §3.4). */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatPaise } from '../lib/format';
import { useToast } from './Toast';

function ProductRow({ product, inCart, onAdd }) {
  const [state, setState] = useState('idle');
  const add = async () => {
    setState('busy');
    const ok = await onAdd(product);
    setState(ok ? 'added' : 'idle');
    if (ok) setTimeout(() => setState('idle'), 1000);
  };
  return (
    <li className="product">
      <div>
        <div>{product.name} <span className="muted">· {product.unitLabel}</span></div>
        {inCart && <div className="muted small">In cart: {inCart}</div>}
      </div>
      <span className="amount">{formatPaise(product.pricePaise)}</span>
      <button disabled={state === 'busy'} onClick={add}>{state === 'added' ? 'Added ✓' : '+ Add'}</button>
    </li>
  );
}

export default function CatalogPanel({ items, meId, names, onAdd }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [type, setType] = useState('shared');
  const q = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    api.catalog().then((r) => setProducts(r.products)).catch((e) => toast(e.message));
  }, [toast]);

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category))], [products]);
  const visible = products.filter((p) => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(q));

  /** productId → "3 (Riya 2, you 1)" over every active line of that product. */
  const inCart = useMemo(() => {
    const byProduct = new Map();
    for (const i of items) {
      const counts = byProduct.get(i.productId) ?? new Map();
      i.contributions.forEach((c) => counts.set(c.memberId, (counts.get(c.memberId) ?? 0) + c.quantity));
      byProduct.set(i.productId, counts);
    }
    return new Map([...byProduct].map(([id, counts]) => {
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      return [id, `${total} (${[...counts].map(([m, n]) => `${names.get(m)} ${n}`).join(', ')})`];
    }));
  }, [items, names]);

  const add = async (product) => {
    const other = type === 'shared' && items.find((i) => i.productId === product.id && i.type === 'shared'
      && !i.contributions.some((c) => c.memberId === meId));
    const res = await onAdd({ productId: product.id, quantity: 1, type });
    if (res && other) toast(`${names.get(other.contributions[0].memberId)} already added this — it'll be flagged as a duplicate`);
    return Boolean(res);
  };

  return (
    <section className="panel stack">
      <input type="search" placeholder="🔍 Search milk, atta, chips…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={c === category ? 'chip-btn active' : 'chip-btn'} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="row">
        <span>Adding as:</span>
        <div className="segmented">
          <button className={type === 'shared' ? 'active shared' : ''} onClick={() => setType('shared')}>◆ Shared</button>
          <button className={type === 'personal' ? 'active personal' : ''} onClick={() => setType('personal')}>◇ Personal</button>
        </div>
      </div>
      {visible.length === 0 && products.length > 0 && <p className="muted center">No products match “{search}”</p>}
      <ul className="list">
        {visible.map((p) => <ProductRow key={p.id} product={p} inCart={inCart.get(p.id)} onAdd={add} />)}
      </ul>
    </section>
  );
}
