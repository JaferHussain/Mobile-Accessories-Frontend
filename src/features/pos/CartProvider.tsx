import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CartLine } from '@/lib/cart';
import type { SaleType } from './posApi';
import { clearStoredCart, readStoredCart, writeStoredCart } from './cartStorage';

/**
 * Where the cart lives.
 *
 * <b>Above the router, not inside the counter screen.</b> It used to be local state in
 * PosScreen, so walking to the Products list to fetch a second item destroyed it — which is why
 * "go back and add more" could never work: there was nothing left to come back to. Held here, a
 * sale survives navigation, and (through cartStorage) an accidental refresh.
 *
 * <b>A restored cart is re-priced before it can be sold.</b> `needsReprice` is raised only when
 * lines came back from storage, never for lines the salesman just added — those were priced by
 * the lookup moments ago. The counter clears the flag once it has re-read them.
 */
export interface CartStore {
  lines: CartLine[];
  setLines: (update: CartLine[] | ((current: CartLine[]) => CartLine[])) => void;

  /**
   * Puts one unit of a product in the cart, or raises its quantity if it is already there.
   *
   * Shared by the counter and the Products list so the merge rule lives in one place: the
   * server refuses two lines for one product, and each would check stock against the same
   * locked row and oversell.
   */
  addItem: (item: { productId: number; productName: string; unitSalePrice: number }) => void;
  saleType: SaleType;
  setSaleType: (saleType: SaleType) => void;

  /** True when these lines came from storage and still carry the price they were saved with. */
  needsReprice: boolean;
  markRepriced: () => void;
}

/** The one place a product becomes a cart line, or raises the quantity of the line it already has. */
function withItem(
  current: CartLine[],
  item: { productId: number; productName: string; unitSalePrice: number },
): CartLine[] {
  const existing = current.find((line) => line.productId === item.productId);

  if (existing) {
    return current.map((line) =>
      line.productId === item.productId ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }

  return [...current, { ...item, quantity: 1, lineDiscount: 0 }];
}

const CartContext = createContext<CartStore | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Read once, at mount. Re-reading later would fight the writes below.
  const restored = useRef(readStoredCart()).current;

  const [lines, setLines] = useState<CartLine[]>(restored?.lines ?? []);
  const [saleType, setSaleType] = useState<SaleType>(restored?.saleType ?? 'Retail');
  const [needsReprice, setNeedsReprice] = useState(restored !== null);

  useEffect(() => {
    // Persisting on every change, rather than on unload: a refresh, a crash and a closed tab
    // all skip unload handlers, and those are exactly the cases this exists for.
    writeStoredCart({ lines, saleType });
  }, [lines, saleType]);

  const store = useMemo<CartStore>(
    () => ({
      lines,
      setLines,
      addItem: (item) => setLines((current) => withItem(current, item)),
      saleType,
      setSaleType,
      needsReprice,
      markRepriced: () => setNeedsReprice(false),
    }),
    [lines, saleType, needsReprice],
  );

  return <CartContext.Provider value={store}>{children}</CartContext.Provider>;
}

/**
 * The counter's handle on the cart.
 *
 * Falls back to component-local state when no provider is present, so PosScreen stays a
 * function of its props and its cart maths can still be tested in isolation — which is how
 * every existing counter test renders it.
 */
export function useCart(): CartStore {
  const provided = useContext(CartContext);

  // Hooks run unconditionally; only the returned value is chosen. The local pair is inert
  // whenever a provider is supplying the real one.
  const [localLines, setLocalLines] = useState<CartLine[]>([]);
  const [localSaleType, setLocalSaleType] = useState<SaleType>('Retail');

  const local = useMemo<CartStore>(
    () => ({
      lines: localLines,
      setLines: setLocalLines,
      addItem: (item) => setLocalLines((current) => withItem(current, item)),
      saleType: localSaleType,
      setSaleType: setLocalSaleType,
      needsReprice: false,
      markRepriced: () => {},
    }),
    [localLines, localSaleType],
  );

  return provided ?? local;
}

export { clearStoredCart };
