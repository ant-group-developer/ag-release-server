# Release Execution 3 - Docs

Thu muc nay gom tat ca tai lieu cua module `release-executions3`.

## Nen doc theo thu tu

1. [`release-execution3-concept.md`](./release-execution3-concept.md)
    - Y tuong tong quan cua module.
    - Cach build cay execution tu mang DSP.
    - Cach chay DFS, step cha/con, sequential/parallel, bubble status.
    - Cach them step moi khi nghiep vu can mo rong.

2. [`release-execution3.docs.md`](./release-execution3.docs.md)
    - Luong submit release execution 3.
    - Luong queue/consumer/cron.
    - Luong engine/worker/result sync.
    - Retry, cancel, waiting admin, CI Tool, State51.

3. [`release-execution3-entities.md`](./release-execution3-entities.md)
    - Entity trong module.
    - Bang database, field chinh, relation, metadata.
    - Cach doc lifecycle cua execution, step, result, queue, CI job.

4. [`services.md`](./services.md)
    - Doc cho tung service.
    - Vai tro, ham chinh, dependency map.
    - Khi them nghiep vu moi thi can sua service nao.

5. [`release-filter-status-dsp.md`](./release-filter-status-dsp.md)
    - Cach filter release theo `release_dsp_delivery.status`.
    - Format `dspDelivery.include/exclude`.
    - Logic `EXISTS` / `NOT EXISTS` theo cap DSP code + status.

6. [`bulk-submit.md`](./bulk-submit.md)
    - API `POST /releases/bulk-submit/preview-result`.
    - API `POST /releases/bulk-submit`.
    - Cach `skipDistributed`, `ciImportAction`, `submitData` hoat dong.

## Mental model nhanh

`ReleaseExecution3Service` tao execution va dua job vao queue.

`ReleaseExecution3Consumer` lay job ra, goi service xu ly.

`ReleaseExecution3Builder` build cay step theo DSP/direct/aggregator.

`ReleaseExecutionStepEngine` chay cay theo DFS: con chay truoc, cha resolve status sau.

`ReleaseExecution3Worker` xu ly task nghiep vu o leaf step.

`ReleaseExecution3ResultService` ghi result va sync ve `release_dsp_delivery`.

`CiDistributionJob3Service` quan ly cac job ngoai he thong nhu CI/export/email/polling.
