import * as migration_20260412_134846_leads_collection from './20260412_134846_leads_collection';
import * as migration_20260420_141211 from './20260420_141211';

export const migrations = [
  {
    up: migration_20260412_134846_leads_collection.up,
    down: migration_20260412_134846_leads_collection.down,
    name: '20260412_134846_leads_collection',
  },
  {
    up: migration_20260420_141211.up,
    down: migration_20260420_141211.down,
    name: '20260420_141211'
  },
];
