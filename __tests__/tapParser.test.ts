import fs from 'fs';
import path from 'path';
import { parseTap } from '../src/tapParser';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

/**
 * For every sub‑folder inside `fixtures/`, read its three files and spin up
 * a Jest test block dynamically.
 */
fs.readdirSync(FIXTURE_DIR, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .forEach((dirent) => {
    const caseName = dirent.name;                 // e.g. "all_pass"
    const casePath = path.join(FIXTURE_DIR, caseName);

    const tapText = fs
      .readFileSync(path.join(casePath, 'tap.tap'), 'utf8')
      .trimEnd();                                 // normalise trailing newline
    const expectedRoots = JSON.parse(
      fs.readFileSync(path.join(casePath, 'roots.json'), 'utf8'),
    );
    const expectedDiagnostics = JSON.parse(
      fs.readFileSync(path.join(casePath, 'diagnostics.json'), 'utf8'),
    );

    describe(`parseTap – ${caseName}`, () => {
      const { roots, diagnostics } = parseTap(tapText);

      test('returns expected roots', () => {
        expect(roots).toEqual(expectedRoots);
      });

      test('returns expected diagnostics', () => {
        expect(diagnostics).toEqual(expectedDiagnostics);
      });
    });
  });
