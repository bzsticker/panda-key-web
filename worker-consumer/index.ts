// worker-consumer/index.ts
export interface Env {
  PYTHON_WORKER_URL: string;
}

interface MessageBatch<Body = any> {
  readonly queue: string;
  readonly messages: readonly Message<Body>[];
}

interface Message<Body = any> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: Body;
  ack(): void;
  retry(): void;
}

export default {
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    console.log(`[Queue Consumer] Received batch of ${batch.messages.length} messages.`);
    
    for (const message of batch.messages) {
      const job = message.body;
      const isWriteTags = job.type === 'write-tags';
      const baseUrl = env.PYTHON_WORKER_URL.replace(/\/analyze$/, '');
      const endpoint = isWriteTags ? '/write-tags' : '/analyze';

      console.log(`[Queue Consumer] Processing track job ID: ${job.track_id}, Type: ${job.type || 'analyze'}, File: ${job.file_name}`);
      
      try {
        const response = await fetch(baseUrl + endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(job),
        });
        
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Python worker responded with ${response.status}: ${text}`);
        }
        
        console.log(`[Queue Consumer] Successfully sent job for track ${job.track_id} to Python worker endpoint ${endpoint}.`);
        message.ack();
      } catch (err) {
        console.error(`[Queue Consumer] Error processing message ${message.id}:`, err);
        message.retry();
      }
    }
  }
};
