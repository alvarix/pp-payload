import * as migration_20260412_134846_leads_collection from './20260412_134846_leads_collection';
import * as migration_20260420_141211 from './20260420_141211';
import * as migration_20260421_183835 from './20260421_183835';
import * as migration_20260422_rename_status_new_to_inquiry from './20260422_rename_status_new_to_inquiry';
import * as migration_20260422_rename_leads_to_organizations from './20260422_rename_leads_to_organizations';

export const migrations = [
  {
    up: migration_20260412_134846_leads_collection.up,
    down: migration_20260412_134846_leads_collection.down,
    name: '20260412_134846_leads_collection',
  },
  {
    up: migration_20260420_141211.up,
    down: migration_20260420_141211.down,
    name: '20260420_141211',
  },
  {
    up: migration_20260421_183835.up,
    down: migration_20260421_183835.down,
    name: '20260421_183835',
  },
  {
    up: migration_20260422_rename_status_new_to_inquiry.up,
    down: migration_20260422_rename_status_new_to_inquiry.down,
    name: '20260422_rename_status_new_to_inquiry',
  },
  {
    up: migration_20260422_rename_leads_to_organizations.up,
    down: migration_20260422_rename_leads_to_organizations.down,
    name: '20260422_rename_leads_to_organizations',
  },
];
