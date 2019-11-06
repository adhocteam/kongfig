import execute from '../src/core';
import { testAdminApi, logger, getLog, tearDown } from '../test-integration/util';
import 'core-js/features/object/from-entries';

beforeEach(tearDown);
jest.setTimeout(10000);

describe('global plugins', () => {
  it('should properly swap username for consumer id', async () => {
    const config = {
      plugins: [
        {
          name: 'rate-limiting',
          attributes: {
            enabled: true,
            username: 'user',
            config: {
              second: 5,
              redis_database: 0,
              policy: 'cluster',
              hide_client_headers: false,
              redis_timeout: 2000,
              redis_port: 6379,
              limit_by: 'consumer',
              fault_tolerant: true
            }
          }
        }
      ],
      consumers: [
        {
          username: 'user',
          ensure: 'present'
        }
      ]
    }

    await execute(config, testAdminApi, logger);
    await execute(config, testAdminApi, logger);

    expect(getLog()).toMatchSnapshot();
  });
});
