#include "Liftoff-2.h"
#include "gcolor_definitions.h"
#include <pebble.h>
#include <time.h>

static Window *s_window;
static TextLayer *s_text_layer;
static bool openedByWakeup = false;
static time_t fetch_time;
static BitmapLayer *s_bitmap_layer;
static GBitmap *s_wakeup_bitmap;

static void set_wakeup(time_t timestamp) {
  const time_t future_timestamp = timestamp;

  const int cookie = 0;

  const bool notify_if_missed = false;

  if (timestamp < time(NULL) - 10) {
    APP_LOG(APP_LOG_LEVEL_ERROR,
            "Invalid or past timestamp passed to set_wakeup");
    return;
  }
  WakeupId id = wakeup_schedule(future_timestamp, cookie, notify_if_missed);

  if (id >= 0) {
    int const wakeup_id_key = 43;
    persist_write_int(wakeup_id_key, id);
    APP_LOG(APP_LOG_LEVEL_DEBUG, "wakeup set!");
  } else {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Timestamp is %d", timestamp);
    APP_LOG(APP_LOG_LEVEL_ERROR, "Wakeup failed with error code: %d", (int)id);
    // set_wakeup(timestamp + SECONDS_PER_MINUTE);
  }
}

time_t get_next_midnight_timestamp() {
  time_t now = time(NULL);
  struct tm *time_info = localtime(&now);
  time_info->tm_mday += 1;
  time_info->tm_hour = 0;
  time_info->tm_min = 0;
  time_info->tm_sec = 0;
  time_info->tm_isdst = -1;
  time_t next_midnight = mktime(time_info);

  return next_midnight;
}

time_t get_next_day_time(const char *time_str) {
  time_t now = time(NULL);
  struct tm *time_info = localtime(&now);
  if (!time_str || strlen(time_str) < 5) {
    return now;
  }
  int hours = atoi(time_str);
  int minutes = atoi(time_str + 3);
  time_info->tm_hour = hours;
  time_info->tm_min = minutes;
  time_info->tm_sec = 0;
  time_info->tm_mday += 1;
  time_t next_day_time = mktime(time_info);

  return next_day_time;
}

time_t get_current_day_time(const char *time_str) {
  time_t now = time(NULL);
  struct tm *time_info = localtime(&now);
  if (!time_str || strlen(time_str) < 5) {
    return now;
  }
  int hours = atoi(time_str);
  int minutes = atoi(time_str + 3);
  time_info->tm_hour = hours;
  time_info->tm_min = minutes;
  time_info->tm_sec = 0;
  time_t next_day_time = mktime(time_info);

  return next_day_time;
}

static void Update_Wakeup(time_t time) {
  wakeup_cancel_all();
  set_wakeup(time);
}

// Tell watch that phone was able to get api successfully.
static void inbox_received_callback(DictionaryIterator *iterator,
                                    void *context) {
  Tuple *error_data_tuple = dict_find(iterator, MESSAGE_KEY_ErrorData);
  Tuple *wkut_tuple = dict_find(iterator, MESSAGE_KEY_updatewkut);
  Tuple *update_tuple = dict_find(iterator, MESSAGE_KEY_FinishedUpdates);

  if (!error_data_tuple && update_tuple) {
    if (openedByWakeup) {
      set_wakeup(time(NULL) + SECONDS_PER_DAY);
      APP_LOG(APP_LOG_LEVEL_DEBUG,
              "API fetched successfully! Setting wakeup for one day.");
      exit_reason_set(APP_EXIT_NOT_SPECIFIED);
      window_stack_pop_all(true);
    } else {
      text_layer_set_text(
          s_text_layer,
          "API fetched successfully!\nFeel free to close this app.");
    }

  } else if (error_data_tuple) {
    if (openedByWakeup) {
      set_wakeup(time(NULL) + SECONDS_PER_DAY);
      APP_LOG(APP_LOG_LEVEL_ERROR,
              "Error fetching API! Retrying in one day. Error: %s",
              error_data_tuple->value->cstring);
      exit_reason_set(APP_EXIT_NOT_SPECIFIED);
      window_stack_pop_all(true);
    } else {
      static char text_buffer[1024];
      snprintf(text_buffer, sizeof(text_buffer), "Error fetching API! %s",
               error_data_tuple->value->cstring);

      text_layer_set_text(s_text_layer, text_buffer);
    }
  }

  if (wkut_tuple) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "wakeup time: %d", wkut_tuple->value->cstring);
    if (get_current_day_time(wkut_tuple->value->cstring) < time(NULL)) {
      Update_Wakeup(get_next_day_time(wkut_tuple->value->cstring));
    } else {
      Update_Wakeup(get_current_day_time(wkut_tuple->value->cstring));
    }
  }
}

static void outbox_sent_callback(DictionaryIterator *iter, void *context) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Phone recieved request");
}

// Request phone to update timeline data
static void update_timeline() {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Fetching data from phone...");
  DictionaryIterator *out_iter;
  AppMessageResult result = app_message_outbox_begin(&out_iter);
  fetch_time = time(NULL);
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

// Currently unavailable. Will be reactivated once server side timeline pins are
// enabled.
static void subscribe() {
  DictionaryIterator *out_iter;
  AppMessageResult result = app_message_outbox_begin(&out_iter);
  if (result == APP_MSG_OK) {
    int value = 0;
    dict_write_int(out_iter, MESSAGE_KEY_Subscribe, &value, sizeof(int), true);

    result = app_message_outbox_send();
    if (result != APP_MSG_OK) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Error sending the outbox: %d", (int)result);
    }
  } else {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Error preparing the outbox: %d", (int)result);
  }
}

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
  time_t wakeup_timestamp = 0;
  if (wakeup_query(43, &wakeup_timestamp)) {
    int seconds_remaining = wakeup_timestamp - time(NULL);
    APP_LOG(APP_LOG_LEVEL_INFO, "%d seconds until wakeup", seconds_remaining);
  } else {
    if (get_next_midnight_timestamp() > 0) {
      set_wakeup(get_next_midnight_timestamp());
    }
  }
  if (!openedByWakeup) {
    s_text_layer =
        text_layer_create(GRect(5, 20, bounds.size.w - 10, bounds.size.h - 40));
    text_layer_set_text(
        s_text_layer,
        "Welcome to liftoff 2! Your timeline should currently be working!");
    text_layer_set_background_color(s_text_layer, GColorClear);
    text_layer_set_font(s_text_layer,
                        fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
    text_layer_set_text_alignment(s_text_layer, GTextAlignmentCenter);
    layer_add_child(window_layer, text_layer_get_layer(s_text_layer));
  } else {
    s_wakeup_bitmap = gbitmap_create_with_resource(RESOURCE_ID_WAKEUP_IMAGE);
    s_bitmap_layer = bitmap_layer_create(bounds);
    bitmap_layer_set_compositing_mode(s_bitmap_layer, GCompOpSet);
    bitmap_layer_set_bitmap(s_bitmap_layer, s_wakeup_bitmap);
    layer_add_child(window_layer, bitmap_layer_get_layer(s_bitmap_layer));
  }
}

static void prv_window_unload(Window *window) {}

static void check_for_fetch_timeout() {
  if (time(NULL) - fetch_time > 6) {
    set_wakeup(time(NULL) + SECONDS_PER_DAY);
    APP_LOG(APP_LOG_LEVEL_ERROR, "API fetch timeout! Retrying in one day.");
    exit_reason_set(APP_EXIT_NOT_SPECIFIED);
    window_stack_pop_all(true);
  }
}
static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  check_for_fetch_timeout();
}

static void prv_init(void) {
  if (launch_reason() == APP_LAUNCH_WAKEUP) {
    openedByWakeup = true;
  } else {
    openedByWakeup = false;
  }
  s_window = window_create();

  window_set_click_config_provider(s_window, prv_click_config_provider);
  window_set_window_handlers(s_window, (WindowHandlers){
                                           .load = prv_window_load,
                                           .unload = prv_window_unload,
                                       });
  const bool animated = true;
  PBL_IF_COLOR_ELSE(window_set_background_color(s_window, GColorCobaltBlue),
                    window_set_background_color(s_window, GColorWhite));

  window_stack_push(s_window, animated);
  if (openedByWakeup) {
    tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
  }
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  app_message_open(512, 64);
  update_timeline();
  // subscribe();
}

static void prv_deinit(void) {
  if (openedByWakeup) {
    bitmap_layer_destroy(s_bitmap_layer);
    gbitmap_destroy(s_wakeup_bitmap);
  } else {
    text_layer_destroy(s_text_layer);
  }
  window_destroy(s_window);
}

int main(void) {
  prv_init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p",
          s_window);

  app_event_loop();
  prv_deinit();
}
