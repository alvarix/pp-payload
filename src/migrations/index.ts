import * as migration_20260412_134846_leads_collection from './20260412_134846_leads_collection';

export const migrations = [
  {
    up: migration_20260412_134846_leads_collection.up,
    down: migration_20260412_134846_leads_collection.down,
    name: '20260412_134846_leads_collection'
  },
];
