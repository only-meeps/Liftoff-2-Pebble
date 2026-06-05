#include "Liftoff-2.h"
#include "gcolor_definitions.h"
#include <pebble.h>
#include <time.h>

static Window *s_window;
static TextLayer *s_text_layer;

static void inbox_received_callback(DictionaryIterator *iterator,
                                    void *context) {
  Tuple *launch_date_tuple = dict_find(iterator, MESSAGE_KEY_LaunchDate);
  Tuple *launch_name_tuple = dict_find(iterator, MESSAGE_KEY_LaunchName);
  Tuple *launch_ID_tuple = dict_find(iterator, MESSAGE_KEY_LaunchID);
  Tuple *error_data_tuple = dict_find(iterator, MESSAGE_KEY_ErrorData);

  if (launch_date_tuple && launch_name_tuple && launch_ID_tuple) {
    time_t launch_time = (time_t)launch_date_tuple->value->int32;
    char *launch_name = launch_name_tuple->value->cstring;
    char *launch_id = launch_ID_tuple->value->cstring;
    static char text_buffer[1024];

    snprintf(text_buffer, sizeof(text_buffer), "API fetched successfully!");

    text_layer_set_text(s_text_layer, text_buffer);
  } else if (error_data_tuple) {
    static char text_buffer[1024];
    snprintf(text_buffer, sizeof(text_buffer), "Error fetching API! %s",
             error_data_tuple->value->cstring);

    text_layer_set_text(s_text_layer, text_buffer);
  }
}

static void outbox_sent_callback(DictionaryIterator *iter, void *context) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Phone recieved request");
}

static void update_timeline() {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Fetching data from phone...");
  DictionaryIterator *out_iter;
  AppMessageResult result = app_message_outbox_begin(&out_iter);
  if (result == APP_MSG_OK) {
    int value = 0;
    dict_write_int(out_iter, MESSAGE_KEY_FetchData, &value, sizeof(int), true);

    result = app_message_outbox_send();
    if (result != APP_MSG_OK) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Error sending the outbox: %d", (int)result);
    }
  } else {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Error preparing the outbox: %d", (int)result);
  }
}

static void timeline_subscribe() {}

static void prv_select_click_handler(ClickRecognizerRef recognizer,
                                     void *context) {
  update_timeline();
}
static void prv_click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select_click_handler);
}
static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_text_layer =
      text_layer_create(GRect(5, 20, bounds.size.w - 10, bounds.size.h - 40));
  text_layer_set_text(
      s_text_layer,
      "Welcome to liftoff 2! This app interface is only to refresh your "
      "timeline manually, though remember, "
      "it should refresh automatically every hour,"
      " and you only have 15 requests per hour. Press the select button to "
      "trigger a manual refresh.");
  text_layer_set_background_color(s_text_layer, GColorClear);
  text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_alignment(s_text_layer, GTextAlignmentCenter);
  layer_add_child(window_layer, text_layer_get_layer(s_text_layer));
}

static void prv_window_unload(Window *window) {
  text_layer_destroy(s_text_layer);
}

static void prv_init(void) {
  s_window = window_create();
  window_set_click_config_provider(s_window, prv_click_config_provider);
  window_set_window_handlers(s_window, (WindowHandlers){
                                           .load = prv_window_load,
                                           .unload = prv_window_unload,
                                       });
  const bool animated = true;
  window_set_background_color(s_window, GColorCobaltBlue);
  window_stack_push(s_window, animated);

  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  app_message_open(512, 64);
}

static void prv_deinit(void) { window_destroy(s_window); }

int main(void) {
  prv_init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p",
          s_window);

  app_event_loop();
  prv_deinit();
}
