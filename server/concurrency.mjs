// Independent pools: image work must not hold the vision/tool permit.
export function createPermitPool(limit) {
  const counts = new Map();
  return {
    acquire(owner) {
      const count = counts.get(owner) || 0;
      if (count >= limit) return null;
      counts.set(owner, count + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const remaining = (counts.get(owner) || 1) - 1;
        if (remaining) counts.set(owner, remaining); else counts.delete(owner);
      };
    },
  };
}
