
DELETE FROM processing_records WHERE id IN ('1c438d0f-7464-4260-93f0-3cc0cb62a04c', '3ad38ef4-bcdf-4865-bbb1-6fd4ff03e929');

UPDATE batches SET batch_status = NULL WHERE id IN ('c41162b8-36dd-4c45-8d9b-5d029f25a8ea', '71cc9157-5891-4546-b85d-842bc8fc30a4');
