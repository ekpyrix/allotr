import { describe, expect, it } from 'vitest';
import { deviceParts } from './device.ts';

describe('deviceParts', () => {
  it('names common browsers and systems', () => {
    expect(
      deviceParts(
        'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      ),
    ).toEqual({ browser: 'Firefox', system: 'Linux' });
    expect(
      deviceParts(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', system: 'Android' });
    expect(
      deviceParts(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', system: 'iOS' });
    expect(
      deviceParts(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      ),
    ).toEqual({ browser: 'Edge', system: 'Windows' });
  });

  it('stays generic for anything else', () => {
    expect(deviceParts('curl/8.0')).toEqual({
      browser: undefined,
      system: undefined,
    });
    expect(deviceParts(null)).toEqual({
      browser: undefined,
      system: undefined,
    });
  });
});
