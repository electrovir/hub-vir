import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';

describe('index', () => {
    it('can be imported', async () => {
        assert.isDefined(await import('./index.js'));
    });
});
