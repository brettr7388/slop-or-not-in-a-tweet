// Worker entry for REST-API deploys: same app, with static files served from D1 when there is no ASSETS binding.
import app from '../src/worker.js';
import { d1Assets } from './d1-assets.js';

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env.ASSETS ? env : { ...env, ASSETS: d1Assets(env.DB) }, ctx);
  },
};
