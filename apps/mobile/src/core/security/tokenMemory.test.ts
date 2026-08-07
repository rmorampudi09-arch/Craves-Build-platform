import {tokenMemory} from './tokenMemory';
describe('tokenMemory',()=>{afterEach(()=>tokenMemory.clear());it('keeps access tokens in memory only',()=>{tokenMemory.set('access-token',300);expect(tokenMemory.get()).toBe('access-token');expect(tokenMemory.isFresh()).toBe(true);tokenMemory.clear();expect(tokenMemory.get()).toBeNull();});});
