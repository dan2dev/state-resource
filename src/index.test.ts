import { describe, it, expect } from 'vitest';
import { useResource } from './index';

describe('useResource', () => {
  it('should return an object with state containing a message', () => {
    const { state } = useResource();
    expect(state.message).toBe('initial project');
  });
});
