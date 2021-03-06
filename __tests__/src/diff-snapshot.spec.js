/*
 * Copyright (c) 2017 American Express Travel Related Services Company, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */

const fs = require('fs');
const path = require('path');

describe('diff-snapshot', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
  });

  describe('diffImageToSnapshot', () => {
    const mockSnapshotsDir = path.normalize('/path/to/snapshots');
    const mockSnapshotIdentifier = 'id1';
    const mockImagePath = './__tests__/stubs/TestImage.png';
    const mockImageBuffer = fs.readFileSync(mockImagePath);
    const mockFailImagePath = './__tests__/stubs/TestImageFailure.png';
    const mockFailImageBuffer = fs.readFileSync(mockFailImagePath);
    const mockMkdirSync = jest.fn();
    const mockMkdirpSync = jest.fn();
    const mockWriteFileSync = jest.fn();
    const mockPixelMatch = jest.fn();

    function setupTest({
      snapshotDirExists,
      snapshotExists,
      outputDirExists,
      defaultExists = true,
      pixelmatchResult = 0,
    }) {
      const mockFs = Object.assign({}, fs, {
        existsSync: jest.fn(),
        mkdirSync: mockMkdirSync,
        writeFileSync: mockWriteFileSync,
        readFileSync: jest.fn(),
      });
      jest.mock('fs', () => mockFs);
      jest.mock('mkdirp', () => ({ sync: mockMkdirpSync }));
      const { diffImageToSnapshot } = require('../../src/diff-snapshot');

      mockFs.existsSync.mockImplementation((p) => {
        switch (p) {
          case path.join(mockSnapshotsDir, `${mockSnapshotIdentifier}-snap.png`):
            return snapshotExists;
          case path.join(mockSnapshotsDir, '__diff_output__'):
            return !!outputDirExists;
          case mockSnapshotsDir:
            return !!snapshotDirExists;
          default:
            return !!defaultExists;
        }
      });
      mockFs.readFileSync.mockImplementation((p) => {
        const bn = path.basename(p);

        if (bn === 'id1-snap.png' && snapshotExists) {
          return mockImageBuffer;
        }

        return null;
      });

      jest.mock('pixelmatch', () => mockPixelMatch);
      mockPixelMatch.mockImplementation(() => pixelmatchResult);

      return diffImageToSnapshot;
    }

    it('should run comparison if there is already a snapshot stored and updateSnapshot flag is not set', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true });
      const result = diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(result).toMatchObject({
        diffOutputPath: path.join(mockSnapshotsDir, '__diff_output__', 'id1-diff.png'),
        diffRatio: 0,
        pixelCountDiff: 0,
        pass: true,
      });
      expect(mockPixelMatch).toHaveBeenCalledTimes(1);
      expect(mockPixelMatch).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Buffer),
        expect.any(Buffer),
        100,
        100,
        { threshold: 0.01 }
      );
    });

    it('it should not write a diff if a test passes', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, pixelmatchResult: 0 });
      const result = diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(result).toMatchObject({
        diffOutputPath: path.join(mockSnapshotsDir, '__diff_output__', 'id1-diff.png'),
        diffRatio: 0,
        pixelCountDiff: 0,
        pass: true,
      });
      // Check that pixelmatch was called
      expect(mockPixelMatch).toHaveBeenCalledTimes(1);
      // Check that that it did not attempt to write a diff
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should write a diff image if the test fails', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, pixelmatchResult: 5000 });
      const result = diffImageToSnapshot({
        imageData: mockFailImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(result).toMatchObject({
        diffOutputPath: path.join(mockSnapshotsDir, '__diff_output__', 'id1-diff.png'),
        diffRatio: 0.5,
        pixelCountDiff: 5000,
        pass: false,
      });
      expect(mockPixelMatch).toHaveBeenCalledTimes(1);
      expect(mockPixelMatch).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Buffer),
        expect.any(Buffer),
        100,
        100,
        { threshold: 0.01 }
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join(mockSnapshotsDir, '__diff_output__', 'id1-diff.png'),
        expect.any(Buffer)
      );
    });

    it('should take the default diff config', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true });

      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });
      expect(mockPixelMatch).toHaveBeenCalledTimes(1);
      expect(mockPixelMatch.mock.calls[0][5]).toMatchSnapshot();
    });

    it('should merge custom configuration with default configuration if custom config is passed', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true });

      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
        customDiffConfig: {
          threshold: 0.1,
          foo: 'bar',
        },
      });
      expect(mockPixelMatch).toHaveBeenCalledTimes(1);
      expect(mockPixelMatch.mock.calls[0][5]).toMatchSnapshot();
    });

    it('should create diff output directory if there is not one already', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, outputDirExists: false });
      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
      });

      expect(mockMkdirpSync).toHaveBeenCalledWith(path.join(mockSnapshotsDir, '__diff_output__'));
    });

    it('should not create diff output directory if there is one there already', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, outputDirExists: true });
      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(mockMkdirSync).not.toHaveBeenCalledWith(path.join(mockSnapshotsDir, '__diff_output__'));
    });

    it('should create snapshots directory is there is not one already', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, snapshotDirExists: false });
      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: true,
      });

      expect(mockMkdirpSync).toHaveBeenCalledWith(mockSnapshotsDir);
    });

    it('should not create snapshots directory if there already is one', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true, snapshotDirExists: true });
      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: true,
      });

      expect(mockMkdirSync).not.toHaveBeenCalledWith(mockSnapshotsDir);
    });

    it('should create snapshot in __image_snapshots__ directory if there is not a snapshot created yet', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: false, snapshotDirExists: false });
      diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(path.join(mockSnapshotsDir, `${mockSnapshotIdentifier}-snap.png`), mockImageBuffer);
    });

    it('should return updated flag is snapshot was updated', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true });
      const diffResult = diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: true,
      });

      expect(diffResult).toHaveProperty('updated', true);
    });

    it('should return added flag is snapshot was added', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: false });
      const diffResult = diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(diffResult).toHaveProperty('added', true);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join(mockSnapshotsDir, 'id1-snap.png'),
        expect.any(Buffer)
      );
    });

    it('should return path to comparison output image if a comparison was performed', () => {
      const diffImageToSnapshot = setupTest({ snapshotExists: true });
      const diffResult = diffImageToSnapshot({
        imageData: mockImageBuffer,
        snapshotIdentifier: mockSnapshotIdentifier,
        snapshotsDir: mockSnapshotsDir,
        updateSnapshot: false,
      });

      expect(diffResult).toHaveProperty('diffOutputPath', path.join(mockSnapshotsDir, '__diff_output__', `${mockSnapshotIdentifier}-diff.png`));
    });
  });
});
