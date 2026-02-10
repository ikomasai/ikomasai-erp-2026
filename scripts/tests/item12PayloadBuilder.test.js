const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const builderPath = path.resolve(__dirname, '../../src/features/item12/utils/item12PayloadBuilder.js');
const item12PayloadBuilder = require(builderPath);

const {
  buildEvaluationPayload,
  buildPatrolCheckPayload,
  buildPatrolResultPayload,
} = item12PayloadBuilder;

test('item12PayloadBuilder: buildPatrolResultPayload creates rpc result payload', () => {
  const payload = buildPatrolResultPayload({
    resultCode: 'ok',
    memo: 'done',
    photoBucket: 'patrol',
    photoPath: 'a/b.jpg',
    createdBy: 'user-1',
  });

  assert.equal(payload.result_code, 'OK');
  assert.equal(payload.memo, 'done');
  assert.equal(payload.photo_bucket, 'patrol');
  assert.equal(payload.photo_path, 'a/b.jpg');
  assert.equal(payload.created_by, 'user-1');
});

test('item12PayloadBuilder: buildPatrolCheckPayload validates category and user', () => {
  const payload = buildPatrolCheckPayload({
    checkedBy: 'user-1',
    checkCategory: 'trouble',
    locationId: 'loc-1',
    memo: 'memo',
  });

  assert.equal(payload.checked_by, 'user-1');
  assert.equal(payload.check_category, 'trouble');
  assert.equal(payload.location_id, 'loc-1');
  assert.equal(payload.memo, 'memo');
});

test('item12PayloadBuilder: buildEvaluationPayload requires at least one relation id', () => {
  const payload = buildEvaluationPayload({
    evaluatorId: 'user-1',
    taskId: 'task-1',
    evaluationStatus: 'pending',
    score: 4,
    comment: 'ok',
  });

  assert.equal(payload.evaluator_id, 'user-1');
  assert.equal(payload.task_id, 'task-1');
  assert.equal(payload.score, 4);
  assert.equal(payload.comment, 'ok');

  assert.throws(() => {
    buildEvaluationPayload({
      evaluatorId: 'user-1',
      evaluationStatus: 'pending',
    });
  });
});
