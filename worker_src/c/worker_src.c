#include <pebble_worker.h>

static void init(void) {
  // Launch the foreground app to trigger the timeline update
  worker_launch_app();
}

static void deinit(void) {
  // Clean up if needed
}

int main(void) {
  init();
  worker_event_loop();
  deinit();
}
