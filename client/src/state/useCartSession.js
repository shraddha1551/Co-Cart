/** Loads the snapshot, subscribes to cart events and presence, resyncs on gaps, and exposes mutations. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from '../lib/api';
import { identity } from '../lib/identity';
import { createSocket } from '../lib/socket';
import { cartReducer, initialState } from './cartReducer';
import { useToast } from '../components/Toast';

const RESYNC_CHECK_MS = 1500;

export function useCartSession(token, onAuthFailed) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [connection, setConnection] = useState('connecting');
  const [online, setOnline] = useState(() => new Set());
  const toast = useToast();
  const stateRef = useRef(state);
  const authFailedRef = useRef(onAuthFailed);
  stateRef.current = state;
  authFailedRef.current = onAuthFailed;

  const resync = useCallback(async () => {
    dispatch({ type: 'RESYNC_START' });
    try {
      dispatch({ type: 'SNAPSHOT', data: await api.state(token) });
    } catch (e) {
      if (e.code === 'NOT_A_MEMBER' || e.code === 'AUTH_REQUIRED') authFailedRef.current();
      else toast(e.message);
    }
  }, [token, toast]);

  useEffect(() => {
    const socket = createSocket(token, identity.get(token));
    socket.on('connect', () => {
      setConnection('live');
      resync();
      socket.emit('presence:hello');
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', (err) => (err.message === 'NOT_A_MEMBER' ? authFailedRef.current() : setConnection('reconnecting')));
    socket.on('cart:event', (event) => dispatch({ type: 'EVENT', event }));
    socket.on('presence:update', ({ online: ids }) => setOnline(new Set(ids)));
    return () => socket.disconnect();
  }, [token, resync]);

  useEffect(() => {
    if (state.needsResync) resync();
  }, [state.needsResync, resync]);

  const actions = useMemo(() => {
    /** Run a REST mutation; errors become toasts. If our own event hasn't arrived in 1.5 s, resync. */
    const mutate = (fn) => async (...args) => {
      try {
        const res = await fn(token, ...args);
        setTimeout(() => stateRef.current.revision < res.revision && resync(), RESYNC_CHECK_MS);
        return res;
      } catch (e) {
        toast(e.message);
        return null;
      }
    };
    return {
      addItem: mutate(api.addItem),
      updateItem: mutate(api.updateItem),
      removeItem: mutate(api.removeItem),
      resolveDuplicate: mutate(api.resolve),
      checkout: mutate(api.checkout),
      setPaid: mutate(api.setPaid),
    };
  }, [token, resync, toast]);

  return { data: state.data, revision: state.revision, connection, online, actions };
}
