import 'reflect-metadata';
import { AppDataSource } from '../../data-source';
import { runTestSeed, teardownTestSeed } from './test.seed';

async function main() {
  const command = process.argv[2] || 'run';

  try {
    const dataSource = AppDataSource;
    await dataSource.initialize();

    if (command === 'teardown') {
      console.log('Running teardown...');
      await teardownTestSeed(dataSource);
      console.log('Teardown complete.');
    } else {
      console.log('Running test seed...');
      const result = await runTestSeed(dataSource);
      console.log('Seed complete.');
      console.log(`Created ${result.companies.length} companies`);
      console.log(`Created ${result.users.length} users`);
    }

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

main();
