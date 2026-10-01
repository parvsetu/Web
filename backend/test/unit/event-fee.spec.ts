import { resolveEventFee } from '../../src/common/event-approval';

describe('event fee precedence', () => {
  const d = { defaultPaise: 49900 };
  it('falls back to the platform default', () => {
    expect(resolveEventFee(d)).toEqual({ feePaise: 49900, source: 'DEFAULT' });
  });
  it('catalog group beats the default, festival type beats the group', () => {
    expect(resolveEventFee({ ...d, groupPaise: 70000 })).toEqual({ feePaise: 70000, source: 'GROUP' });
    expect(resolveEventFee({ ...d, groupPaise: 70000, typePaise: 99900 })).toEqual({ feePaise: 99900, source: 'FESTIVAL_TYPE' });
  });
  it('a mandal override beats everything, including an explicit zero', () => {
    expect(resolveEventFee({ ...d, groupPaise: 70000, typePaise: 99900, mandalPaise: 0 })).toEqual({ feePaise: 0, source: 'MANDAL' });
    expect(resolveEventFee({ ...d, typePaise: 0 })).toEqual({ feePaise: 0, source: 'FESTIVAL_TYPE' });
  });
  it('null / undefined mean "not set"', () => {
    expect(resolveEventFee({ ...d, mandalPaise: null, typePaise: undefined, groupPaise: null })).toEqual({ feePaise: 49900, source: 'DEFAULT' });
  });
});
