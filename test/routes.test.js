import expect from 'expect.js';
import cloneDeep from 'lodash.clonedeep';
import { parseRoute } from '../src/readKongApi';
import { addServiceRoute, updateServiceRoute } from '../src/actions';

const serviceId = 'c67fce4b-55d5-4db0-9158-731b21afbd7f'
const baseRoute = {
    id: 'a3315ad5-07de-4e5b-bedb-05f115b9751e',
    created_at: 1572044350,
    updated_at: 1572044350,
    service: {
        id: serviceId
    },
    tags: null,
    paths: ['/mockbin'],
    destinations: null,
    protocols: ['http', 'https'],
    snis: null,
    hosts: null,
    name: 'bar',
    preserve_host: false,
    regex_priority: 0,
    strip_path: true,
    sources: null,
    https_redirect_status_code: 426,
    methods: null
};

const baseConfig = {
    services: [{
        name: 'mockbin',
        ensure: 'present',
        attributes: {
            url: 'http://mockbin.com'
        },
        routes: [{
            name: 'foo',
            id: 'a3315ad5-07de-4e5b-bedb-05f115b9751e',
            attributes: {
                name: 'bar',
                paths: ['/mockbin']
            }
        }]
    }]
};

const serviceName = 'mockbin'

describe('parsing routes', () => {
    it('uses the name in the attributes if present', () => {
        expect(parseRoute(baseRoute, serviceName, baseConfig).name).to.be('bar');
        expect(parseRoute(baseRoute, serviceName, baseConfig).attributes.name).to.be('bar');
    });

    it('uses the top level name property if attributes.name is missing', () => {
        const config = cloneDeep(baseConfig)
        delete config.services[0].routes[0].attributes.name
        expect(parseRoute(baseRoute, serviceName, config).name).to.be('foo');
        expect(parseRoute(baseRoute, serviceName, config).attributes.name).to.be('foo');
    });
});

describe('route actions', () => {
    it('includes the name when adding a new route', () => {
        expect(addServiceRoute(serviceId, baseRoute).body.name).to.be('bar');
    });

    it('includes the name when updating a route', () => {
        expect(updateServiceRoute(serviceId, baseRoute).body.name).to.be('bar');
    })
})
