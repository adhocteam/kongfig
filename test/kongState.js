import expect from 'expect.js';
import sinon from 'sinon';
import adminApi from '../src/adminApi';
import kongState from '../src/kongState';

describe('kongState', () => {
  let api, versionStub, fetchGlobalPluginsStub;
  beforeEach(() => {
    api = adminApi({
      host: 'http://fake-localhost:8000/',
      https: false,
      ignoreConsumers: false,
    });
    
    versionStub = sinon.stub(api, 'fetchKongVersion').returns('1.2.0');
    sinon.stub(api, 'fetchPlugins').returns([]);
    sinon.stub(api, 'fetchApis').returns([]);
    sinon.stub(api, 'fetchServices').returns([]);
    sinon.stub(api, 'fetchServicePlugins').returns([]);
    sinon.stub(api, 'fetchServiceRoutes').returns([]);
    sinon.stub(api, 'fetchRoutePlugins').returns([]);
    sinon.stub(api, 'fetchConsumers').returns([]);
    sinon.stub(api, 'fetchConsumerCredentials').returns([]);
    sinon.stub(api, 'fetchConsumerAcls').returns([]);
    fetchGlobalPluginsStub = sinon.stub(api, 'fetchGlobalPlugins').returns([]);
    sinon.stub(api, 'fetchUpstreams').returns([]);
    sinon.stub(api, 'fetchTargets').returns([]);
    sinon.stub(api, 'fetchCertificates').returns([]);
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('plugins', () => {
    let globalPlugin, routePlugin, servicePlugin, serviceRoutePlugin;
    describe('should work with v1.x', () => {
      beforeEach(() => {
        globalPlugin = {
          id: 'a1',
          service: null,
          route: null,
        };
        routePlugin = {
          id: 'b1',
          service: null,
          route: { id: 'b3' },
        };
        servicePlugin = {
          id: 'c1',
          service: { id: 'c2' },
          route: null,
        };
        serviceRoutePlugin = {
          id: 'd1',
          service: { id: 'd2' },
          route: { id: 'd3' },
        };

        fetchGlobalPluginsStub.returns([
          routePlugin,
          servicePlugin,
          globalPlugin,
          serviceRoutePlugin,
        ]);
      });

      it('should exclude plugins with a service and a route', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'd1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should exclude service plugins', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'c1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should exclude route plugins', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'b1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should include plugins with neither a service nor a route', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'a1');
          expect(targetPlugin).to.not.be(undefined);
          expect(targetPlugin).to.have.keys('id', 'service', 'route');
          done();
        });
      });
    });

    describe('should be backwards-compatible with v0.x', () => {
      beforeEach(() => {
        globalPlugin = {
          id: 'a1',
        };
        routePlugin = {
          id: 'b1',
          route_id: 'b3',
        };
        servicePlugin = {
          id: 'c1',
          service_id: 'c2',
        };
        serviceRoutePlugin = {
          id: 'd1',
          service_id: 'd2',
          route_id: 'd3',
        };

        versionStub.returns('0.14.1');
        fetchGlobalPluginsStub.returns([
          routePlugin,
          servicePlugin,
          globalPlugin,
          serviceRoutePlugin,
        ]);
      });

      it('should exclude plugins with a service and a route', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'd1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should exclude service plugins', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'c1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should exclude route plugins', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'b1');
          expect(targetPlugin).to.be(undefined);
          done();
        });
      });

      it('should include plugins with neither a service nor a route', (done) => {
        kongState(api).then(state => {
          const targetPlugin = state.plugins.find(plugin => plugin.id === 'a1');
          expect(targetPlugin).to.not.be(undefined);
          expect(targetPlugin).to.have.keys('id');
          done();
        });
      });
    });
  });
});
