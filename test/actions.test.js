import expect from 'expect.js';
import {updateServiceRoute, addServiceRoute} from '../src/actions.js';

const ROUTE_CONFIG = {
  name: 'name',
  id: 'id',
  skip_auth: true,
  plugins: [],
  attributes: {
    strip_path: false,
    hosts: null,
    preserve_host: false,
    regex_priority: 0,
    paths: [],
    methods: [],
    protocols: [],
  },
};

const EXPECTED_BODY = {
  strip_path: false,
  hosts: null,
  preserve_host: false,
  regex_priority: 0,
  paths: [],
  methods: [],
  protocols: [],
  service: {
    id: 'id',
  },
};

describe('update service route', () => {
  it('ignores "skip_auth"', () => {
    const req = updateServiceRoute('id', ROUTE_CONFIG);
    expect(req.body).to.be.eql(EXPECTED_BODY);
  });
});

describe('add service route', () => {
  it('ignores "skip_auth"', () => {
    const req = addServiceRoute('id', ROUTE_CONFIG);
    expect(req.body).to.be.eql(EXPECTED_BODY);
  });
});